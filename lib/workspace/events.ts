import { randomUUID } from "node:crypto";
import prisma from "@/lib/database/prisma";
import { WorkspaceError } from "./errors";

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function appendAgentEvent(tx: Transaction, input: { runId: string; type: string; itemId?: string; toolCallId?: string; payload: unknown }) {
  const itemId = input.itemId ?? randomUUID();
  await tx.$queryRaw`SELECT "id" FROM "platform"."AgentRun" WHERE "id" = ${input.runId} FOR UPDATE`;
  const existing = await tx.agentEvent.findUnique({ where: { runId_type_itemId: { runId: input.runId, type: input.type, itemId } } });
  if (existing) return existing;
  const run = await tx.agentRun.update({ where: { id: input.runId }, data: { nextEventSeq: { increment: 1 } }, select: { nextEventSeq: true } });
  return tx.agentEvent.create({ data: {
    runId: input.runId, sequence: run.nextEventSeq - 1, type: input.type, itemId, toolCallId: input.toolCallId,
    payload: JSON.parse(JSON.stringify(input.payload ?? {})),
  } });
}

export async function listAgentEvents(input: { runId: string; userId: string; after?: number; limit?: number }) {
  const after = input.after ?? 0;
  const limit = input.limit ?? 100;
  if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkspaceError("INVALID_CURSOR", "Invalid event cursor or page size");
  const run = await prisma.agentRun.findFirst({ where: { id: input.runId, workspace: { project: { userId: input.userId, status: "ACTIVE" } } }, select: { id: true, sessionId: true, turnId: true, status: true, summary: true, workspaceId: true, nextEventSeq: true } });
  if (!run) throw new WorkspaceError("NOT_FOUND", "Agent run not found");
  const events = await prisma.agentEvent.findMany({ where: { runId: run.id, sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: limit });
  return { run, events, nextCursor: events.at(-1)?.sequence ?? after, hasMore: events.length === limit };
}
