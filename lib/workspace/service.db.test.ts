import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import {
  createDraftWorkspace,
  closeDraftWorkspace,
  listDraftFiles,
  readDraftFile,
  writeDraftFile,
  searchDraftFiles,
  readDraftFileRange,
  patchDraftFile,
  deleteDraftFile,
} from "./service";
import { materializeDraftRevision } from "./projection";
import { inspectWorkspaceDiagnostics, validateAndRecordWorkspaceRevision } from "./validation";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const projectId = randomUUID();

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.create({ data: { id: userId, email: `${userId}@workspace.test` } });
  await prisma.project.create({
    data: { id: projectId, userId, name: "Workspace test", slug: `workspace-${projectId}` },
  });
});

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.draftWorkspace.updateMany({ where: { projectId, status: "ACTIVE" }, data: { status: "CLOSED" } });
});

dbTest("creates an empty draft and persists idempotent CAS writes", async () => {
  const taskId = randomUUID();
  const draft = await createDraftWorkspace({ projectId, userId, taskId });
  assert.equal(draft.revision, 0);
  assert.equal((await createDraftWorkspace({ projectId, userId, taskId })).id, draft.id);
  assert.deepEqual(await listDraftFiles({ workspaceId: draft.id, userId }), []);

  const first = await writeDraftFile({
    workspaceId: draft.id,
    userId,
    toolCallId: "call-1",
    expectedRevision: 0,
    path: "frontend/App.tsx",
    content: "export default function App() { return null; }",
  });
  assert.equal(first.revision, 1);
  assert.equal(first.repeated, false);
  assert.equal((await readDraftFile({ workspaceId: draft.id, userId, path: first.path })).content, "export default function App() { return null; }");

  const retry = await writeDraftFile({
    workspaceId: draft.id,
    userId,
    toolCallId: "call-1",
    expectedRevision: 0,
    path: "frontend/App.tsx",
    content: "export default function App() { return null; }",
  });
  assert.equal(retry.revision, 1);
  assert.equal(retry.repeated, true);
  const changes = await prisma.draftFileChange.findMany({ where: { workspaceId: draft.id } });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].toolCallId, "call-1");
  assert.equal(changes[0].revision, 1);
  assert.equal(changes[0].beforeSha256, null);
  assert.equal(changes[0].afterSha256, first.sha256);
  await assert.rejects(
    writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "invalid-encoding", expectedRevision: 1, path: "frontend/invalid.tsx", content: "\uD800" }),
    { code: "INVALID_CONTENT" },
  );
  await assert.rejects(
    writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "too-large", expectedRevision: 1, path: "frontend/large.tsx", content: "x".repeat(1024 * 1024 + 1) }),
    { code: "INVALID_CONTENT" },
  );
  assert.equal((await prisma.draftWorkspace.findUniqueOrThrow({ where: { id: draft.id } })).revision, 1);
  await assert.rejects(
    writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "call-2", expectedRevision: 0, path: "frontend/App.tsx", content: "changed" }),
    { code: "REVISION_CONFLICT" },
  );
  assert.equal((await listDraftFiles({ workspaceId: draft.id, userId })).length, 1);
  assert.deepEqual(await listDraftFiles({ workspaceId: draft.id, userId, revision: 0 }), []);
  await assert.rejects(readDraftFile({ workspaceId: draft.id, userId, path: first.path, revision: 0 }), { code: "FILE_NOT_FOUND" });
});

dbTest("allows only one active draft writer for a project", async () => {
  const first = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  await assert.rejects(createDraftWorkspace({ projectId, userId, taskId: randomUUID() }), { code: "WORKSPACE_BUSY" });
  await closeDraftWorkspace({ workspaceId: first.id, userId });
  const next = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  assert.notEqual(next.id, first.id);
});

dbTest("copies a base version and denies access from another user", async () => {
  const artifact = await prisma.artifact.create({ data: { projectId } });
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: 1,
      files: { create: [{ path: "backend/operations.go", content: "package backend" }] },
    },
  });
  const draft = await createDraftWorkspace({ projectId, userId, taskId: randomUUID(), baseArtifactVersionId: version.id });
  assert.equal(draft.revision, 0);
  assert.equal((await readDraftFile({ workspaceId: draft.id, userId, path: "backend/operations.go" })).content, "package backend");
  await assert.rejects(listDraftFiles({ workspaceId: draft.id, userId: randomUUID() }), { code: "NOT_FOUND" });
  await assert.rejects(
    writeDraftFile({ workspaceId: draft.id, userId: randomUUID(), toolCallId: "unauthorized", expectedRevision: 0, path: "backend/operations.go", content: "changed" }),
    { code: "NOT_FOUND" },
  );
});

dbTest("concurrent writes produce one revision and one event", async () => {
  const draft = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const writes = await Promise.allSettled([
    writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "parallel-a", expectedRevision: 0, path: "frontend/App.tsx", content: "A" }),
    writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "parallel-b", expectedRevision: 0, path: "frontend/App.tsx", content: "B" }),
  ]);
  assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(writes.filter((result) => result.status === "rejected").length, 1);
  const current = await prisma.draftWorkspace.findUniqueOrThrow({ where: { id: draft.id } });
  assert.equal(current.revision, 1);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: draft.id } }), 1);
  assert.equal(await prisma.draftWriteReceipt.count({ where: { workspaceId: draft.id } }), 1);
  assert.equal(await prisma.draftFileRevision.count({ where: { workspaceId: draft.id } }), 1);
});

dbTest("searches and reads bounded ranges from a selected revision", async () => {
  const draft = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "range-1", expectedRevision: 0, path: "frontend/App.tsx", content: "alpha\nbeta\nalpha" });
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "range-2", expectedRevision: 1, path: "frontend/Other.tsx", content: "beta" });
  assert.deepEqual((await searchDraftFiles({ workspaceId: draft.id, userId, query: "beta", revision: 1 })).map((hit) => [hit.path, hit.line]), [["frontend/App.tsx", 2]]);
  assert.deepEqual((await searchDraftFiles({ workspaceId: draft.id, userId, query: "beta" })).map((hit) => [hit.path, hit.line]), [["frontend/App.tsx", 2], ["frontend/Other.tsx", 1]]);
  assert.deepEqual(await readDraftFileRange({ workspaceId: draft.id, userId, path: "frontend/App.tsx", startLine: 2, endLine: 3 }), { path: "frontend/App.tsx", startLine: 2, endLine: 3, totalLines: 3, content: "beta\nalpha" });
  await assert.rejects(readDraftFileRange({ workspaceId: draft.id, userId, path: "frontend/App.tsx", startLine: 0, endLine: 3 }), { code: "INVALID_RANGE" });
});

dbTest("patch and delete are CAS protected, idempotent, and retain history", async () => {
  const draft = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "start", expectedRevision: 0, path: "frontend/App.tsx", content: "first\nsecond" });
  const patched = await patchDraftFile({ workspaceId: draft.id, userId, toolCallId: "patch", expectedRevision: 1, path: "frontend/App.tsx", oldText: "second", newText: "revised" });
  assert.equal(patched.revision, 2);
  assert.equal((await readDraftFile({ workspaceId: draft.id, userId, path: "frontend/App.tsx" })).content, "first\nrevised");
  assert.equal((await patchDraftFile({ workspaceId: draft.id, userId, toolCallId: "patch", expectedRevision: 1, path: "frontend/App.tsx", oldText: "second", newText: "revised" })).repeated, true);
  await assert.rejects(patchDraftFile({ workspaceId: draft.id, userId, toolCallId: "bad-patch", expectedRevision: 2, path: "frontend/App.tsx", oldText: "absent", newText: "x" }), { code: "PATCH_CONFLICT" });
  const deleted = await deleteDraftFile({ workspaceId: draft.id, userId, toolCallId: "delete", expectedRevision: 2, path: "frontend/App.tsx" });
  assert.equal(deleted.revision, 3);
  assert.equal((await deleteDraftFile({ workspaceId: draft.id, userId, toolCallId: "delete", expectedRevision: 2, path: "frontend/App.tsx" })).repeated, true);
  await assert.rejects(readDraftFile({ workspaceId: draft.id, userId, path: "frontend/App.tsx" }), { code: "FILE_NOT_FOUND" });
  assert.equal((await readDraftFile({ workspaceId: draft.id, userId, path: "frontend/App.tsx", revision: 2 })).content, "first\nrevised");
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: draft.id } }), 3);
  assert.equal(await prisma.draftWriteReceipt.count({ where: { workspaceId: draft.id } }), 3);
  assert.equal((await prisma.draftWorkspace.findUniqueOrThrow({ where: { id: draft.id } })).revision, 3);
});

dbTest("reconstructs an older workspace revision after later writes", async () => {
  const draft = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "projection-1", expectedRevision: 0, path: "frontend/App.tsx", content: "old" });
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "projection-2", expectedRevision: 1, path: "frontend/App.tsx", content: "new" });
  const projection = await materializeDraftRevision({ workspaceId: draft.id, userId, revision: 1 });
  try {
    assert.equal(await readFile(path.join(projection.directory, "frontend/App.tsx"), "utf8"), "old");
  } finally {
    await projection.dispose();
  }
});

dbTest("persists validation against its source revision and keeps it readable after a later edit", async () => {
  const draft = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "validate-1", expectedRevision: 0, path: "frontend/App.tsx", content: "export default function App() { return <div>Hello</div>; }" });
  const result = await validateAndRecordWorkspaceRevision({ workspaceId: draft.id, userId, revision: 1, runtimeType: "STATIC" });
  assert.equal(result.status, "PASSED");
  await writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "validate-2", expectedRevision: 1, path: "frontend/App.tsx", content: "broken" });
  const recorded = await inspectWorkspaceDiagnostics({ workspaceId: draft.id, userId, revision: 1 });
  assert.equal(recorded?.id, result.validationRunId);
  assert.equal(recorded?.revision, 1);
  await assert.rejects(inspectWorkspaceDiagnostics({ workspaceId: draft.id, userId: randomUUID(), revision: 1 }), { code: "NOT_FOUND" });
});
