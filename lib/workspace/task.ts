import prisma from "@/lib/database/prisma";
import { executeAgentRun, type AgentModel } from "./agent-run";
import { commitValidatedWorkspace } from "./commit";
import { WorkspaceError } from "./service";
import { validationContextDigest } from "./validation-context";

export async function executeWorkspaceTask(input: { runId: string; userId: string; model: AgentModel }) {
  const run = await executeAgentRun(input);
  if (run.status !== "READY_TO_VALIDATE" && run.status !== "COMMITTED") return { run, commit: null };
  const workspace = await prisma.draftWorkspace.findFirst({ where: { id: run.workspaceId, project: { userId: input.userId, status: "ACTIVE" } }, include: { baseArtifactVersion: true } });
  if (!workspace) throw new WorkspaceError("NOT_FOUND", "Workspace not found");
  const contextDigest = validationContextDigest(run.runtimeType, run.appBlueprint ?? workspace.baseArtifactVersion?.appBlueprint);
  const validation = await prisma.draftValidationRun.findFirst({ where: { workspaceId: workspace.id, revision: workspace.revision, contextDigest, status: "PASSED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!validation) throw new WorkspaceError("VALIDATION_REQUIRED", "The current workspace revision has no passed validation");
  const commit = await commitValidatedWorkspace({ runId: run.id, userId: input.userId, revision: workspace.revision, validationRunId: validation.id });
  return { run: await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } }), commit };
}
