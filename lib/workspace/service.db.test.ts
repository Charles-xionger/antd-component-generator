import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import {
  createDraftWorkspace,
  listDraftFiles,
  readDraftFile,
  writeDraftFile,
} from "./service";

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
    writeDraftFile({ workspaceId: draft.id, userId, toolCallId: "call-2", expectedRevision: 0, path: "frontend/App.tsx", content: "changed" }),
    { code: "REVISION_CONFLICT" },
  );
  assert.equal((await listDraftFiles({ workspaceId: draft.id, userId })).length, 1);
  assert.deepEqual(await listDraftFiles({ workspaceId: draft.id, userId, revision: 0 }), []);
  await assert.rejects(readDraftFile({ workspaceId: draft.id, userId, path: first.path, revision: 0 }), { code: "FILE_NOT_FOUND" });
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
