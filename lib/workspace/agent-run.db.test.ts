import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import { closeDraftWorkspace, createDraftWorkspace, readDraftFile, writeDraftFile } from "./service";
import { cancelAgentRun, createAgentRun, executeAgentRun, resumeAgentRun } from "./agent-run";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const projectId = randomUUID();

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.create({ data: { id: userId, email: `${userId}@agent-run.test` } });
  await prisma.project.create({ data: { id: projectId, userId, name: "Agent run test", slug: `agent-run-${projectId}` } });
});

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.draftWorkspace.updateMany({ where: { projectId, status: "ACTIVE" }, data: { status: "CLOSED" } });
});

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

dbTest("scripted model writes one file and resumes without replaying a completed step", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a page", runtimeType: "STATIC", maxSteps: 4 });
  let calls = 0;
  const model = { decide: async () => {
    calls += 1;
    return calls === 1
      ? { kind: "tool" as const, name: "write_file" as const, arguments: { path: "frontend/App.tsx", content: "export default function App() { return null }" } }
      : { kind: "complete" as const, summary: "Ready for validation" };
  } };
  const result = await executeAgentRun({ runId: run.id, userId, model });
  assert.equal(result.status, "READY_TO_VALIDATE", result.summary ?? undefined);
  assert.equal((await readDraftFile({ workspaceId: workspace.id, userId, path: "frontend/App.tsx" })).content, "export default function App() { return null }");
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  assert.equal((await resumeAgentRun({ runId: run.id, userId, model })).status, "READY_TO_VALIDATE");
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  assert.equal(calls, 2);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("invalid model tool args return a structured failure and permit a local retry", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a page", runtimeType: "STATIC", maxSteps: 4 });
  let calls = 0;
  const model = { decide: async () => {
    calls += 1;
    if (calls === 1) return { kind: "tool", name: "write_file", arguments: { path: "../escape", content: "bad" } };
    if (calls === 2) return { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null; }" } };
    return { kind: "complete", summary: "ready" };
  } };
  const result = await executeAgentRun({ runId: run.id, userId, model });
  assert.equal(result.status, "READY_TO_VALIDATE", result.summary ?? undefined);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  assert.equal((await readDraftFile({ workspaceId: workspace.id, userId, path: "frontend/App.tsx" })).content, "export default function App() { return null; }");
  const firstStep = await prisma.agentRunStep.findUniqueOrThrow({ where: { runId_number: { runId: run.id, number: 0 } } });
  assert.equal((firstStep.result as { ok: boolean }).ok, false);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("an interrupted model tool call retries without losing earlier workspace files", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create two files", runtimeType: "STATIC", maxSteps: 5 });
  const model = { decide: async ({ step }: { step: number }) => {
    if (step === 0) return { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null; }" } };
    if (step === 1) throw new Error("MODEL_TOOL_CALL_INVALID");
    if (step === 2) return { kind: "tool", name: "write_file", arguments: { path: "frontend/Other.tsx", content: "export const other = 1;" } };
    return { kind: "complete", summary: "Ready" };
  } };
  const result = await executeAgentRun({ runId: run.id, userId, model });
  assert.equal(result.status, "READY_TO_VALIDATE", result.summary ?? undefined);
  const failedStep = await prisma.agentRunStep.findUniqueOrThrow({ where: { runId_number: { runId: run.id, number: 1 } } });
  assert.equal((failedStep.result as { error: { code: string } }).error.code, "MODEL_TOOL_CALL_INVALID");
  assert.equal((failedStep.decision as { expectedRevision: number }).expectedRevision, 1);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 2);
  assert.equal(await prisma.agentEvent.count({ where: { runId: run.id, type: "file.changed" } }), 2);
  assert.equal(await prisma.agentEvent.count({ where: { runId: run.id, type: "model.response_rejected" } }), 1);
  assert.match((await readDraftFile({ workspaceId: workspace.id, userId, path: "frontend/App.tsx" })).content, /return null/);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("repeated invalid model calls stop without writing a file", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a page", runtimeType: "STATIC", maxSteps: 5 });
  let calls = 0;
  const result = await executeAgentRun({ runId: run.id, userId, model: { decide: async () => { calls += 1; return { kind: "tool", name: "write_file", arguments: [] }; } } });
  assert.equal(result.status, "NO_PROGRESS");
  assert.equal(calls, 2);
  const firstStep = await prisma.agentRunStep.findUniqueOrThrow({ where: { runId_number: { runId: run.id, number: 0 } } });
  assert.equal((firstStep.result as { error: { code: string } }).error.code, "MODEL_DECISION_INVALID");
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 0);
  assert.equal(await prisma.agentEvent.count({ where: { runId: run.id, type: "file.changed" } }), 0);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("compiler diagnostics return to the same run and trigger a one-file patch", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Fix the page", runtimeType: "STATIC", maxSteps: 5 });
  const decisions = [
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return <div>" } },
    { kind: "complete", summary: "Check page" },
    { kind: "tool", name: "patch_file", arguments: { path: "frontend/App.tsx", oldText: "return <div>", newText: "return <div>Fixed</div>; }" } },
    { kind: "complete", summary: "Fixed page" },
  ];
  const model = { decide: async ({ step }: { step: number }) => decisions[step] };
  const result = await executeAgentRun({ runId: run.id, userId, model });
  assert.equal(result.status, "READY_TO_VALIDATE", result.summary ?? undefined);
  assert.equal((await readDraftFile({ workspaceId: workspace.id, userId, path: "frontend/App.tsx" })).content, "export default function App() { return <div>Fixed</div>; }");
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 2);
  const validations = await prisma.draftValidationRun.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(validations.map((item) => item.status), ["FAILED", "PASSED"]);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("run_command accepts only named checks and leaves workspace files unchanged", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: "seed-command", expectedRevision: 0, path: "frontend/App.tsx", content: "export default function App() { return null; }" });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Check the page", runtimeType: "STATIC", maxSteps: 4 });
  const decisions = [
    { kind: "tool", name: "run_command", arguments: { command: "sh -c cat /etc/passwd" } },
    { kind: "tool", name: "run_command", arguments: { command: "typecheck_frontend" } },
    { kind: "complete", summary: "Checked" },
  ];
  const result = await executeAgentRun({ runId: run.id, userId, model: { decide: async ({ step }) => decisions[step] } });
  assert.equal(result.status, "READY_TO_VALIDATE");
  const steps = await prisma.agentRunStep.findMany({ where: { runId: run.id }, orderBy: { number: "asc" } });
  assert.equal((steps[0].result as { ok: boolean }).ok, false);
  assert.deepEqual((steps[1].result as { value: { diagnostics: unknown[] } }).value.diagnostics, []);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("plan updates and structured scenarios survive as workspace data without a JSON envelope from the model", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Build an item flow", runtimeType: "GO", maxSteps: 5 });
  const decisions = [
    { kind: "tool", name: "update_plan", arguments: { summary: "Build and check item flow", steps: [{ id: "acceptance", title: "Write acceptance scenarios", status: "in_progress" }] } },
    { kind: "tool", name: "write_scenarios", arguments: { scenarios: [] } },
    { kind: "tool", name: "write_scenarios", arguments: { scenarios: [{ id: "basic", description: "Get item", steps: [{ operationId: "get.item" }] }] } },
    { kind: "question", question: "Which data source?" },
  ];
  const result = await executeAgentRun({ runId: run.id, userId, model: { decide: async ({ step }) => decisions[step] } });
  assert.equal(result.status, "NEEDS_INPUT");
  assert.deepEqual((await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } })).plan, { summary: "Build and check item flow", steps: [{ id: "acceptance", title: "Write acceptance scenarios", status: "in_progress" }] });
  const file = await readDraftFile({ workspaceId: workspace.id, userId, path: "acceptance/scenarios.json" });
  assert.deepEqual(JSON.parse(file.content).scenarios[0].steps[0].operationId, "get.item");
  assert.equal((await prisma.draftWorkspace.findUniqueOrThrow({ where: { id: workspace.id } })).revision, 1);
  assert.equal((await prisma.agentEvent.count({ where: { runId: run.id, type: "plan.updated" } })), 2);
  const invalid = await prisma.agentRunStep.findUniqueOrThrow({ where: { runId_number: { runId: run.id, number: 1 } } });
  assert.equal((invalid.result as { ok: boolean }).ok, false);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("a validated completion closes the durable plan before version commit", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Build a page", runtimeType: "STATIC", maxSteps: 4 });
  const decisions = [
    { kind: "tool", name: "update_plan", arguments: { summary: "Build a page", steps: [{ id: "page", title: "Write page", status: "in_progress" }, { id: "check", title: "Validate", status: "pending" }] } },
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null; }" } },
    { kind: "complete", summary: "Ready" },
  ];
  const result = await executeAgentRun({ runId: run.id, userId, model: { decide: async ({ step }) => decisions[step] } });
  assert.equal(result.status, "READY_TO_VALIDATE");
  const saved = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  assert.deepEqual((saved.plan as { steps: Array<{ status: string }> }).steps.map((step) => step.status), ["completed", "completed"]);
  assert.equal(await prisma.agentEvent.count({ where: { runId: run.id, type: "plan.updated" } }), 3);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("reclaims a decided write after a crash without rewriting its receipt", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Resume a page", runtimeType: "STATIC", maxSteps: 3 });
  const content = "export default function App() { return null; }";
  await prisma.agentRunStep.create({ data: { runId: run.id, number: 0, decision: { decision: { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content } }, expectedRevision: 0 } } });
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: `${run.id}:0`, expectedRevision: 0, path: "frontend/App.tsx", content });
  let calls = 0;
  const model = { decide: async () => { calls += 1; return { kind: "complete", summary: "Recovered" }; } };
  const result = await resumeAgentRun({ runId: run.id, userId, model });
  assert.equal(result.status, "READY_TO_VALIDATE", result.summary ?? undefined);
  assert.equal(calls, 1);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("cancellation fences a model response and subsequent file writes", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Cancel a page", runtimeType: "STATIC", maxSteps: 3 });
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const model = { decide: async () => { entered(); await blocked; return { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "late" } }; } };
  const executing = executeAgentRun({ runId: run.id, userId, model });
  await started;
  const claimed = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  assert.ok(claimed.leaseToken);
  const cancelled = await cancelAgentRun({ runId: run.id, userId });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.summary, "用户已取消，草稿已保留");
  release();
  assert.equal((await executing).status, "CANCELLED");
  await assert.rejects(writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: "late", expectedRevision: 0, path: "frontend/App.tsx", content: "late", agentLease: { runId: run.id, leaseToken: claimed.leaseToken! } }), { code: "RUN_LEASE_LOST" });
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 0);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("repeated blocking diagnostics without a write stop as no_progress", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a page", runtimeType: "STATIC", maxSteps: 5 });
  let calls = 0;
  const model = { decide: async () => {
    calls += 1;
    return calls === 1 ? { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "not typescript!" } } : { kind: "complete", summary: "Done" };
  } };
  const result = await executeAgentRun({ runId: run.id, userId, model });
  assert.equal(result.status, "NO_PROGRESS", result.summary ?? undefined);
  assert.equal(calls, 3);
  assert.equal(await prisma.draftValidationRun.count({ where: { workspaceId: workspace.id } }), 2);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});
