import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import { createAgentRun } from "./agent-run";
import { commitValidatedWorkspace } from "./commit";
import { closeDraftWorkspace, createDraftWorkspace, writeDraftFile } from "./service";
import { validateAndRecordWorkspaceRevision } from "./validation";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const projectId = randomUUID();

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.create({ data: { id: userId, email: `${userId}@workspace-commit.test` } });
  await prisma.project.create({ data: { id: projectId, userId, name: "Workspace commit test", slug: `commit-${projectId}` } });
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

dbTest("commits a validated static snapshot once and locks the draft", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a static app", runtimeType: "STATIC" });
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: "static-app", expectedRevision: 0, path: "frontend/App.tsx", content: "export default function App() { return <div>Ready</div>; }" });
  const validation = await validateAndRecordWorkspaceRevision({ workspaceId: workspace.id, userId, revision: 1, runtimeType: "STATIC" });
  assert.equal(validation.status, "PASSED");
  await assert.rejects(commitValidatedWorkspace({ runId: run.id, userId: randomUUID(), revision: 1, validationRunId: validation.validationRunId }), { code: "NOT_FOUND" });
  await assert.rejects(commitValidatedWorkspace({ runId: run.id, userId, revision: 1, validationRunId: validation.validationRunId }), { code: "RUN_NOT_READY" });
  await prisma.agentRun.update({ where: { id: run.id }, data: { status: "READY_TO_VALIDATE" } });
  const [first, parallel] = await Promise.all([
    commitValidatedWorkspace({ runId: run.id, userId, revision: 1, validationRunId: validation.validationRunId }),
    commitValidatedWorkspace({ runId: run.id, userId, revision: 1, validationRunId: validation.validationRunId }),
  ]);
  assert.equal(first.version.id, parallel.version.id);
  assert.equal(Number(first.repeated) + Number(parallel.repeated), 1);
  assert.equal(first.previewJob, null);
  assert.equal(first.version.files.length, 1);
  const retry = await commitValidatedWorkspace({ runId: run.id, userId, revision: 1, validationRunId: validation.validationRunId });
  assert.equal(retry.version.id, first.version.id);
  assert.equal(retry.repeated, true);
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 1);
  await assert.rejects(writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: "late-write", expectedRevision: 1, path: "frontend/App.tsx", content: "late" }), { code: "REVISION_CONFLICT" });
});

dbTest("failed or stale validation cannot produce a version", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a static app", runtimeType: "STATIC" });
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: "bad-app", expectedRevision: 0, path: "frontend/App.tsx", content: "export default function App() { return <div>" });
  const failed = await validateAndRecordWorkspaceRevision({ workspaceId: workspace.id, userId, revision: 1, runtimeType: "STATIC" });
  assert.equal(failed.status, "FAILED");
  await prisma.agentRun.update({ where: { id: run.id }, data: { status: "READY_TO_VALIDATE" } });
  await assert.rejects(commitValidatedWorkspace({ runId: run.id, userId, revision: 1, validationRunId: failed.validationRunId }), { code: "VALIDATION_REQUIRED" });
  await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: "fixed-app", expectedRevision: 1, path: "frontend/App.tsx", content: "export default function App() { return null; }" });
  await assert.rejects(commitValidatedWorkspace({ runId: run.id, userId, revision: 1, validationRunId: failed.validationRunId }), { code: "REVISION_CONFLICT" });
  assert.equal(await prisma.artifactVersion.count({ where: { generationRequestId: `workspace:${workspace.id}` } }), 0);
  await closeDraftWorkspace({ workspaceId: workspace.id, userId });
});

dbTest("commits a Go snapshot with exactly one preview job in the same transaction", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const files = [
    ["migrations/001_init.sql", "CREATE TABLE items (id int);"],
    ["backend/operations.go", `package backend
import (
  "context"
  "encoding/json"
  "log/slog"
  "github.com/jackc/pgx/v5/pgxpool"
)
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation {
  return map[string]Operation{"get.item": func(_ context.Context, _ json.RawMessage) (any, error) { return map[string]any{"ok": true}, nil }}
}`],
    ["acceptance/scenarios.json", JSON.stringify({ scenarios: [{ id: "basic", description: "Get item", steps: [{ operationId: "get.item" }] }] })],
    ["frontend/App.tsx", "export default function App() { return <div>Ready</div>; }"],
  ] as const;
  for (const [index, [filePath, content]] of files.entries()) {
    await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: `go-${index}`, expectedRevision: index, path: filePath, content });
  }
  const blueprint = {
    blueprintVersion: 1, runtimeType: "GO",
    product: { name: "Items", goal: "Get items", actors: ["User"], workflows: ["Get item"], acceptanceCriteria: ["Returns item"] },
    pages: [], entities: [], operations: [{ id: "get.item", method: "GET", path: "/api/items", description: "Get item" }],
  };
  const persistedBlueprint = { ...blueprint, product: { ...blueprint.product, name: "Persisted items app" } };
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create an items app", runtimeType: "GO", appBlueprint: persistedBlueprint });
  const mismatched = await validateAndRecordWorkspaceRevision({ workspaceId: workspace.id, userId, revision: 4, runtimeType: "GO", blueprint: blueprint as never });
  assert.equal(mismatched.status, "PASSED");
  await prisma.agentRun.update({ where: { id: run.id }, data: { status: "READY_TO_VALIDATE" } });
  await assert.rejects(commitValidatedWorkspace({ runId: run.id, userId, revision: 4, validationRunId: mismatched.validationRunId }), { code: "VALIDATION_REQUIRED" });
  const validation = await validateAndRecordWorkspaceRevision({ workspaceId: workspace.id, userId, revision: 4, runtimeType: "GO", blueprint: persistedBlueprint as never });
  assert.equal(validation.status, "PASSED", JSON.stringify(validation.diagnostics));
  const first = await commitValidatedWorkspace({ runId: run.id, userId, revision: 4, validationRunId: validation.validationRunId });
  assert.equal(first.version.runtimeVersion, "go-1.24");
  assert.equal(first.previewJob?.type, "FULLSTACK_PREVIEW");
  const retry = await commitValidatedWorkspace({ runId: run.id, userId, revision: 4, validationRunId: validation.validationRunId });
  assert.equal(retry.version.id, first.version.id);
  assert.equal(retry.previewJob?.id, first.previewJob?.id);
  assert.equal(await prisma.buildJob.count({ where: { artifactVersionId: first.version.id, type: "FULLSTACK_PREVIEW" } }), 1);
});
