import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { HumanMessage } from "@langchain/core/messages";
import prisma from "@/lib/database/prisma";
import { workspaceQueue } from "./workspace-node";
import type { AgentState } from "./state";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const projectId = randomUUID();

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.create({ data: { id: userId, email: `${userId}@workspace-queue.test` } });
  await prisma.project.create({ data: { id: projectId, userId, name: "Workspace queue", slug: `queue-${projectId}` } });
});

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

dbTest("generation graph queues a workspace run without code in assistant messages", async () => {
  const requestId = randomUUID();
  const state = { messages: [new HumanMessage("Create a small static app")], intentResult: { intent: "CREATE_APP", confidence: 1, requiresClarification: false, reason: "test", requestedCapabilities: [] } } as AgentState;
  const config = { configurable: { project_id: projectId, user_id: userId, generation_request_id: requestId, model: "test-model" } };
  const first = await workspaceQueue(state, config);
  const again = await workspaceQueue(state, config);
  assert.equal(first.workspaceId, again.workspaceId);
  assert.equal(first.workspaceRunId, again.workspaceRunId);
  assert.equal((await prisma.draftWorkspace.findMany({ where: { projectId } })).length, 1);
  assert.equal((await prisma.agentRun.findMany({ where: { requestId } })).length, 1);
  assert.ok(!String(first.messages?.[0]?.content).includes("<boltArtifact"));
  await prisma.agentRun.update({ where: { id: first.workspaceRunId }, data: { status: "NEEDS_INPUT", summary: "Which color?" } });
  const continued = await workspaceQueue({ messages: [new HumanMessage("Blue")], resumePendingWorkspace: true } as AgentState, { configurable: { ...config.configurable, generation_request_id: randomUUID() } });
  assert.equal(continued.workspaceId, first.workspaceId);
  const continuedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: continued.workspaceRunId } });
  assert.match(continuedRun.goal, /Create a small static app/);
  assert.match(continuedRun.goal, /Blue/);
});
