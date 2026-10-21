import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import { createAgentRun, executeAgentRun } from "./agent-run";
import { createDraftWorkspace, writeDraftFile } from "./service";
import { validateAndRecordWorkspaceRevision } from "./validation";
import { processPendingWorkspaceTasks } from "./worker";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const projectId = randomUUID();

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.create({ data: { id: userId, email: `${userId}@workspace-worker.test` } });
  await prisma.project.create({ data: { id: projectId, userId, name: "Workspace worker test", slug: `worker-${projectId}` } });
});

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

dbTest("worker claims a queued run, validates, and commits once", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a page", runtimeType: "STATIC", modelName: "qwen3.7-flash-2026-07-15" });
  const decisions = [
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null; }" } },
    { kind: "complete", summary: "Ready" },
  ];
  const modelFactory = () => ({ decide: async ({ step }: { step: number }) => decisions[step] });
  const processed = await processPendingWorkspaceTasks({ limit: 1, projectId, modelFactory });
  assert.deepEqual(processed.map((item) => [item.runId, item.status, item.error]), [[run.id, "COMMITTED", null]]);
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 1);
  assert.deepEqual(await processPendingWorkspaceTasks({ limit: 1, projectId, modelFactory }), []);
});

dbTest("worker resumes an expired write lease without duplicating the file change", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Resume after file write", runtimeType: "STATIC" });
  const content = "export default function App() { return <p>Recovered</p>; }";
  await prisma.agentRunStep.create({ data: { runId: run.id, number: 0, decision: { decision: { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content } }, expectedRevision: 0 } } });
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: `${run.id}:0`, expectedRevision: 0, path: "frontend/App.tsx", content });
  await prisma.agentRun.update({ where: { id: run.id }, data: { status: "RUNNING", leaseToken: randomUUID(), leaseUntil: new Date(Date.now() - 1000) } });
  let modelCalls = 0;
  const processed = await processPendingWorkspaceTasks({ projectId, modelFactory: () => ({ decide: async () => { modelCalls += 1; return { kind: "complete", summary: "Recovered" }; } }) });
  assert.deepEqual(processed.map(({ status, error }) => [status, error]), [["COMMITTED", null]]);
  assert.equal(modelCalls, 1, "Only the next undecided step may consult the model");
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 1);
});

dbTest("worker reruns an interrupted validation and commits the same revision once", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Resume during validation", runtimeType: "STATIC" });
  const content = "export default function App() { return <p>Validated</p>; }";
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: `${run.id}:0`, expectedRevision: 0, path: "frontend/App.tsx", content });
  await prisma.agentRunStep.createMany({ data: [
    { runId: run.id, number: 0, decision: { decision: { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content } }, expectedRevision: 0 }, status: "COMPLETED", result: { ok: true }, completedAt: new Date() },
    { runId: run.id, number: 1, decision: { decision: { kind: "complete", summary: "Validated" }, expectedRevision: 1 } },
  ] });
  await prisma.agentRun.update({ where: { id: run.id }, data: { status: "RUNNING", nextStep: 1, leaseToken: randomUUID(), leaseUntil: new Date(Date.now() - 1000) } });
  const firstValidation = await validateAndRecordWorkspaceRevision({ workspaceId: workspace.id, userId, revision: 1, runtimeType: "STATIC" });
  assert.equal(firstValidation.status, "PASSED");
  const processed = await processPendingWorkspaceTasks({ projectId, modelFactory: () => ({ decide: async () => { throw new Error("Persisted decision must be replayed"); } }) });
  assert.deepEqual(processed.map(({ status, error }) => [status, error]), [["COMMITTED", null]]);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: workspace.id } }), 1);
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 1);
  assert.equal(await prisma.draftValidationRun.count({ where: { workspaceId: workspace.id, revision: 1, status: "PASSED" } }), 2, "The safe read-only check may rerun after a crash");
});

dbTest("worker commits a ready run after restart without another model call", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Resume before commit", runtimeType: "STATIC" });
  const decisions = [
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null; }" } },
    { kind: "complete", summary: "Ready to commit" },
  ];
  const ready = await executeAgentRun({ runId: run.id, userId, model: { decide: async ({ step }: { step: number }) => decisions[step] } });
  assert.equal(ready.status, "READY_TO_VALIDATE");
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 0);
  const modelFactory = () => ({ decide: async () => { throw new Error("Ready run must not call model"); } });
  const processed = await processPendingWorkspaceTasks({ projectId, modelFactory });
  assert.deepEqual(processed.map(({ status, error }) => [status, error]), [["COMMITTED", null]]);
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 1);
  assert.deepEqual(await processPendingWorkspaceTasks({ projectId, modelFactory }), []);
});
