import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import { executeAgentRun } from "@/lib/workspace/agent-run";
import { writeDraftFile } from "@/lib/workspace/service";
import { createWorkspaceApi } from "./handlers";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const otherUserId = randomUUID();
const projectId = randomUUID();
const secondProjectId = randomUUID();
const api = createWorkspaceApi({ authenticate: async () => userId });
const outsider = createWorkspaceApi({ authenticate: async () => otherUserId });
const anonymous = createWorkspaceApi({ authenticate: async () => null });

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.createMany({ data: [{ id: userId, email: `${userId}@workspace-api.test` }, { id: otherUserId, email: `${otherUserId}@workspace-api.test` }] });
  await prisma.project.createMany({ data: [
    { id: projectId, userId, name: "Workspace API test", slug: `api-${projectId}` },
    { id: secondProjectId, userId, name: "Workspace API cancel", slug: `api-${secondProjectId}` },
  ] });
});

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.user.delete({ where: { id: otherUserId } });
  await prisma.$disconnect();
});

dbTest("authenticated API queues a run, exposes cursor events and files, and rejects cross-user reads", async () => {
  const requestId = randomUUID();
  const body = { projectId, requestId, goal: "Create a page", runtimeType: "STATIC", modelName: "test-model" };
  const request = () => new Request("http://localhost/api/workspaces", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await anonymous.create(request())).status, 401);
  const created = await api.create(request());
  assert.equal(created.status, 202);
  const data = await created.json();
  assert.equal(data.run.status, "QUEUED");
  const workspaceId = data.workspace.id as string;
  const runId = data.run.id as string;
  const projectView = await api.list(new Request(`http://localhost/api/workspaces?projectId=${projectId}`));
  assert.equal((await projectView.json()).run.id, runId);
  assert.equal((await outsider.list(new Request(`http://localhost/api/workspaces?projectId=${projectId}`))).status, 404);
  assert.equal((await api.create(request())).status, 202);
  assert.equal(await prisma.agentRun.count({ where: { requestId } }), 1);

  const decisions = [
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null }" } },
    { kind: "question", question: "Which color?" },
  ];
  await executeAgentRun({ runId, userId, model: { decide: async ({ step }) => decisions[step] } });
  const status = await api.getRun(workspaceId, runId);
  assert.equal((await status.json()).run.status, "NEEDS_INPUT");
  const files = await api.getFiles(new Request(`http://localhost/api/workspaces/${workspaceId}/files`), workspaceId);
  const firstSnapshot = await files.json();
  assert.equal(firstSnapshot.revision, 1);
  assert.deepEqual(firstSnapshot.files.map((file: { path: string }) => file.path), ["frontend/App.tsx"]);
  await writeDraftFile({ workspaceId, userId, toolCallId: "api-newer-revision", expectedRevision: 1, path: "frontend/Other.tsx", content: "export default 1" });
  const oldSnapshot = await api.getFiles(new Request(`http://localhost/api/workspaces/${workspaceId}/files?revision=1`), workspaceId);
  assert.equal((await oldSnapshot.json()).files.length, 1);
  const currentSnapshot = await api.getFiles(new Request(`http://localhost/api/workspaces/${workspaceId}/files`), workspaceId);
  const currentData = await currentSnapshot.json();
  assert.equal(currentData.revision, 2);
  assert.deepEqual(currentData.files.map((entry: { path: string }) => entry.path), ["frontend/App.tsx", "frontend/Other.tsx"]);
  const file = await api.getFiles(new Request(`http://localhost/api/workspaces/${workspaceId}/files?path=frontend%2FApp.tsx`), workspaceId);
  assert.match((await file.json()).file.content, /export default/);
  const firstPage = await api.getEvents(new Request(`http://localhost/api/workspaces/${workspaceId}/runs/${runId}/events?after=0&limit=2`), workspaceId, runId);
  const firstEvents = await firstPage.json();
  assert.deepEqual(firstEvents.events.map((event: { sequence: number }) => event.sequence), [1, 2]);
  const nextPage = await api.getEvents(new Request(`http://localhost/api/workspaces/${workspaceId}/runs/${runId}/events?after=2`), workspaceId, runId);
  assert.ok((await nextPage.json()).events.every((event: { sequence: number }) => event.sequence > 2));
  assert.equal((await outsider.getRun(workspaceId, runId)).status, 404);
  assert.equal((await outsider.getFiles(new Request(`http://localhost/api/workspaces/${workspaceId}/files?path=frontend%2FApp.tsx`), workspaceId)).status, 404);
  assert.equal((await outsider.getEvents(new Request(`http://localhost/api/workspaces/${workspaceId}/runs/${runId}/events`), workspaceId, runId)).status, 404);
  assert.equal((await api.getFiles(new Request(`http://localhost/api/workspaces/${workspaceId}/files?path=..%2Fsecret`), workspaceId)).status, 400);
});

dbTest("cancel is authenticated and workspace-scoped", async () => {
  const created = await api.create(new Request("http://localhost/api/workspaces", { method: "POST", body: JSON.stringify({ projectId: secondProjectId, requestId: randomUUID(), goal: "Wait", runtimeType: "STATIC" }) }));
  const { workspace, run } = await created.json();
  assert.equal((await outsider.cancel(workspace.id, run.id)).status, 404);
  assert.equal((await api.cancel(randomUUID(), run.id)).status, 404);
  const cancelled = await api.cancel(workspace.id, run.id);
  assert.equal((await cancelled.json()).run.status, "CANCELLED");
  assert.equal((await api.cancel(workspace.id, run.id)).status, 200);
  assert.equal((await api.getEvents(new Request(`http://localhost/api/workspaces/${workspace.id}/runs/${run.id}/events?after=-1`), workspace.id, run.id)).status, 400);
});
