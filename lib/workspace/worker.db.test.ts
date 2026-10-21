import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import { createAgentRun } from "./agent-run";
import { createDraftWorkspace } from "./service";
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
