import { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "./state";
import prisma from "@/lib/database/prisma";
import { createAgentRun } from "@/lib/workspace/agent-run";
import { createDraftWorkspace, WorkspaceError } from "@/lib/workspace/service";
import { appBlueprintSchema, requirementSpecSchema } from "@/lib/app-contracts";

type QueueConfig = { configurable?: { project_id?: string; user_id?: string; generation_request_id?: string; model?: string } };

export async function workspaceQueue(state: AgentState, config?: QueueConfig): Promise<Partial<AgentState>> {
  const projectId = config?.configurable?.project_id;
  const userId = config?.configurable?.user_id;
  const requestId = config?.configurable?.generation_request_id;
  if (!projectId || !userId || !requestId) throw new WorkspaceError("INVALID_REQUEST", "Workspace task identity is missing");
  const latestHuman = [...state.messages].reverse().find((message) => message._getType() === "human");
  const goal = typeof latestHuman?.content === "string"
    ? latestHuman.content.trim()
    : Array.isArray(latestHuman?.content)
      ? latestHuman.content.map((part) => typeof part === "object" && part && "text" in part ? String(part.text ?? "") : "").join(" ").trim()
      : "";
  if (!goal) throw new WorkspaceError("INVALID_REQUEST", "Workspace task requires a text goal");
  const base = state.baseArtifactVersionId
    ? await prisma.artifactVersion.findFirst({ where: { id: state.baseArtifactVersionId, artifact: { projectId } }, select: { id: true, runtimeVersion: true, requirementSpec: true, appBlueprint: true } })
    : null;
  const active = await prisma.draftWorkspace.findFirst({ where: { projectId, status: "ACTIVE" }, select: { id: true, taskId: true, baseArtifactVersionId: true, agentRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { requestId: true, goal: true, status: true, runtimeType: true, requirementSpec: true, appBlueprint: true } } } });
  const workspace = active ?? await createDraftWorkspace({ projectId, userId, taskId: requestId, baseArtifactVersionId: base?.id });
  const previousRun = active?.agentRuns[0];
  if (previousRun && ["QUEUED", "RUNNING", "READY_TO_VALIDATE"].includes(previousRun.status) && previousRun.requestId !== requestId) {
    throw new WorkspaceError("WORKSPACE_BUSY", "当前项目已有进行中的工作区任务，请等待完成或取消后再试");
  }
  const isExistingApp = Boolean(base && ["MODIFY_APP", "FIX_APP"].includes(state.intentResult?.intent || ""));
  const blueprint = previousRun?.appBlueprint ?? (isExistingApp ? base?.appBlueprint ?? undefined : state.appBlueprint ?? base?.appBlueprint ?? undefined);
  const requirement = previousRun?.requirementSpec ?? (isExistingApp ? base?.requirementSpec ?? undefined : state.requirementSpec ?? base?.requirementSpec ?? undefined);
  const runtimeType = previousRun?.runtimeType ?? (isExistingApp ? (base!.runtimeVersion ? "GO" : "STATIC") : state.appBlueprint?.runtimeType ?? (base?.runtimeVersion ? "GO" : "STATIC"));
  const checkedBlueprint = blueprint == null ? undefined : appBlueprintSchema.safeParse(blueprint);
  const checkedRequirement = requirement == null ? undefined : requirementSpecSchema.safeParse(requirement);
  const run = await createAgentRun({
    workspaceId: workspace.id, userId, requestId,
    goal: previousRun?.status === "NEEDS_INPUT" ? `${previousRun.goal.slice(0, 12_000)}\n用户补充：${goal.slice(0, 3500)}` : goal,
    runtimeType,
    modelName: config?.configurable?.model,
    requirementSpec: checkedRequirement?.success ? checkedRequirement.data : undefined,
    appBlueprint: checkedBlueprint?.success ? checkedBlueprint.data : undefined,
  });
  return {
    workspaceId: workspace.id,
    workspaceRunId: run.id,
    messages: [new AIMessage("已创建工作区任务。接下来会按文件增量修改并验证；进度和代码以工作区为准。")],
  };
}
