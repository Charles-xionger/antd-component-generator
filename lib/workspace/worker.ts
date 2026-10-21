import "dotenv/config";
import prisma from "@/lib/database/prisma";
import { appendAgentEvent } from "./events";
import { createWorkspaceAgentModel } from "./model-adapter";
import { WorkspaceError } from "./service";
import { executeWorkspaceTask } from "./task";

export async function processPendingWorkspaceTasks(input: { limit?: number; projectId?: string; modelFactory?: typeof createWorkspaceAgentModel } = {}) {
  const limit = input.limit ?? 2;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new WorkspaceError("INVALID_LIMIT", "Invalid worker batch size");
  const now = new Date();
  const runs = await prisma.agentRun.findMany({
    where: {
      workspace: { status: "ACTIVE", project: { status: "ACTIVE", ...(input.projectId ? { id: input.projectId } : {}) } },
      OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: now } }, { status: "READY_TO_VALIDATE" }],
    },
    orderBy: { createdAt: "asc" }, take: limit,
    include: { workspace: { include: { project: true, baseArtifactVersion: true } } },
  });
  const modelFactory = input.modelFactory ?? createWorkspaceAgentModel;
  return Promise.all(runs.map(async (run) => {
    try {
      const model = modelFactory(run.modelName, { requirementSpec: run.requirementSpec ?? run.workspace.baseArtifactVersion?.requirementSpec, appBlueprint: run.appBlueprint ?? run.workspace.baseArtifactVersion?.appBlueprint });
      const result = await executeWorkspaceTask({ runId: run.id, userId: run.workspace.project.userId, model });
      return { runId: run.id, status: result.run.status, error: null };
    } catch (error) {
      if (error instanceof WorkspaceError && error.code === "RUN_BUSY") return { runId: run.id, status: "RUNNING", error: null };
      if (run.status === "READY_TO_VALIDATE" && error instanceof WorkspaceError) {
        await prisma.$transaction(async (tx) => {
          const failed = await tx.agentRun.updateMany({ where: { id: run.id, status: "READY_TO_VALIDATE" }, data: { status: "FAILED", summary: error.message.slice(0, 2000) } });
          if (failed.count) await appendAgentEvent(tx, { runId: run.id, type: "run.failed", itemId: run.id, payload: { code: error.code, message: error.message } });
        });
      }
      return { runId: run.id, status: "ERROR", error: error instanceof Error ? error.message : String(error) };
    }
  }));
}

async function main() {
  while (true) {
    const results = await processPendingWorkspaceTasks();
    for (const result of results) if (result.error) console.error("[workspace-agent-worker]", result.runId, result.error);
    await new Promise((resolve) => setTimeout(resolve, results.length ? 1000 : 2500));
  }
}

if (process.argv[1]?.endsWith("lib/workspace/worker.ts")) {
  void main().catch((error) => {
    console.error("[workspace-agent-worker] fatal", error);
    process.exitCode = 1;
  });
}
