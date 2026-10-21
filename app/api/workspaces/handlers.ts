import { z } from "zod";
import prisma from "@/lib/database/prisma";
import { cancelAgentRun, createAgentRun } from "@/lib/workspace/agent-run";
import { listAgentEvents } from "@/lib/workspace/events";
import { WorkspacePathError } from "@/lib/workspace/path";
import { createDraftWorkspace, listDraftFiles, readDraftFile, WorkspaceError } from "@/lib/workspace/service";

const createSchema = z.object({
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  requestId: z.string().min(1).max(128),
  goal: z.string().min(1).max(16_000),
  runtimeType: z.enum(["STATIC", "GO"]),
  baseArtifactVersionId: z.string().uuid().optional(),
  requirementSpec: z.unknown().optional(),
  appBlueprint: z.unknown().optional(),
  maxSteps: z.number().int().min(1).max(100).optional(),
  modelName: z.string().min(1).max(120).optional(),
}).strict().refine((value) => Boolean(value.projectId) !== Boolean(value.workspaceId), "Specify exactly one projectId or workspaceId");

type Auth = () => Promise<string | null>;

function apiError(error: unknown): Response {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }, { status: 400 });
  if (error instanceof WorkspacePathError) return Response.json({ error: "Invalid workspace path", code: error.code }, { status: 400 });
  if (error instanceof WorkspaceError) {
    const status = error.code === "NOT_FOUND" || error.code === "FILE_NOT_FOUND" ? 404
      : error.code.includes("CONFLICT") || error.code === "WORKSPACE_BUSY" || error.code === "RUN_BUSY" ? 409
      : error.code === "VALIDATION_REQUIRED" ? 422 : 400;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  return Response.json({ error: "Workspace request failed" }, { status: 500 });
}

async function ownedWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.draftWorkspace.findFirst({
    where: { id: workspaceId, project: { userId, status: "ACTIVE" } },
    select: { id: true, projectId: true, taskId: true, baseArtifactVersionId: true, status: true, revision: true, createdAt: true, updatedAt: true },
  });
  if (!workspace) throw new WorkspaceError("NOT_FOUND", "Workspace not found");
  return workspace;
}

async function ownedRun(workspaceId: string, runId: string, userId: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId, workspace: { project: { userId, status: "ACTIVE" } } },
  });
  if (!run) throw new WorkspaceError("NOT_FOUND", "Agent run not found");
  return run;
}

function runView(run: { id: string; workspaceId: string; sessionId: string; turnId: string; status: string; runtimeType: string; nextStep: number; maxSteps: number; summary: string | null; nextEventSeq: number; createdAt: Date; updatedAt: Date }) {
  return { id: run.id, workspaceId: run.workspaceId, sessionId: run.sessionId, turnId: run.turnId, status: run.status, runtimeType: run.runtimeType, nextStep: run.nextStep, maxSteps: run.maxSteps, summary: run.summary, eventCursor: run.nextEventSeq - 1, createdAt: run.createdAt, updatedAt: run.updatedAt };
}

export function createWorkspaceApi(deps: { authenticate: Auth }) {
  const withAuth = async (action: (userId: string) => Promise<Response>) => {
    const userId = await deps.authenticate();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try { return await action(userId); } catch (error) { return apiError(error); }
  };

  return {
    list(request: Request) {
      return withAuth(async (userId) => {
        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId || !z.string().uuid().safeParse(projectId).success) throw new WorkspaceError("INVALID_REQUEST", "Project ID is required");
        const project = await prisma.project.findFirst({ where: { id: projectId, userId, status: "ACTIVE" }, select: { id: true } });
        if (!project) throw new WorkspaceError("NOT_FOUND", "Project not found");
        const workspace = await prisma.draftWorkspace.findFirst({
          where: { projectId }, orderBy: { createdAt: "desc" },
          select: { id: true, projectId: true, revision: true, status: true, agentRuns: { orderBy: { createdAt: "desc" }, take: 1 } },
        });
        return Response.json({ workspace: workspace ? { id: workspace.id, projectId, revision: workspace.revision, status: workspace.status } : null, run: workspace?.agentRuns[0] ? runView(workspace.agentRuns[0]) : null });
      });
    },
    create(request: Request) {
      return withAuth(async (userId) => {
        const body = createSchema.parse(await request.json().catch(() => ({})));
        const prior = await prisma.agentRun.findUnique({ where: { requestId: body.requestId }, include: { workspace: { include: { project: true } } } });
        if (prior) {
          if (prior.workspace.project.userId !== userId || prior.workspace.project.status !== "ACTIVE" || (body.projectId && prior.workspace.projectId !== body.projectId) || (body.workspaceId && prior.workspaceId !== body.workspaceId) || prior.goal !== body.goal || prior.runtimeType !== body.runtimeType || prior.modelName !== (body.modelName ?? "qwen3.7-flash-2026-07-15") || prior.maxSteps !== (body.maxSteps ?? 30) || (body.baseArtifactVersionId && prior.workspace.baseArtifactVersionId !== body.baseArtifactVersionId) || (body.requirementSpec !== undefined && JSON.stringify(prior.requirementSpec) !== JSON.stringify(body.requirementSpec)) || (body.appBlueprint !== undefined && JSON.stringify(prior.appBlueprint) !== JSON.stringify(body.appBlueprint))) {
            throw new WorkspaceError("REQUEST_CONFLICT", "Request ID already used");
          }
          return Response.json({ workspace: { id: prior.workspace.id, projectId: prior.workspace.projectId, revision: prior.workspace.revision, status: prior.workspace.status }, run: runView(prior) }, { status: 202 });
        }
        const workspace = body.workspaceId
          ? await ownedWorkspace(body.workspaceId, userId)
          : await createDraftWorkspace({ projectId: body.projectId!, userId, taskId: body.requestId, baseArtifactVersionId: body.baseArtifactVersionId });
        const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: body.requestId, goal: body.goal, runtimeType: body.runtimeType, requirementSpec: body.requirementSpec, appBlueprint: body.appBlueprint, maxSteps: body.maxSteps, modelName: body.modelName });
        return Response.json({ workspace: { id: workspace.id, projectId: workspace.projectId, revision: workspace.revision, status: workspace.status }, run: runView(run) }, { status: 202 });
      });
    },
    getWorkspace(workspaceId: string) {
      return withAuth(async (userId) => {
        const workspace = await ownedWorkspace(workspaceId, userId);
        const run = await prisma.agentRun.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
        return Response.json({ workspace, run: run ? runView(run) : null });
      });
    },
    getFiles(request: Request, workspaceId: string) {
      return withAuth(async (userId) => {
        const query = new URL(request.url).searchParams;
        const revisionValue = query.get("revision");
        const workspace = await ownedWorkspace(workspaceId, userId);
        const revision = revisionValue === null ? workspace.revision : Number(revisionValue);
        const path = query.get("path");
        if (path !== null) {
          const file = await readDraftFile({ workspaceId, userId, path, revision });
          return Response.json({ file });
        }
        const files = await listDraftFiles({ workspaceId, userId, revision });
        return Response.json({ files, revision });
      });
    },
    getRun(workspaceId: string, runId: string) {
      return withAuth(async (userId) => Response.json({ run: runView(await ownedRun(workspaceId, runId, userId)) }));
    },
    cancel(workspaceId: string, runId: string) {
      return withAuth(async (userId) => {
        await ownedRun(workspaceId, runId, userId);
        return Response.json({ run: runView(await cancelAgentRun({ runId, userId })) });
      });
    },
    getEvents(request: Request, workspaceId: string, runId: string) {
      return withAuth(async (userId) => {
        await ownedRun(workspaceId, runId, userId);
        const query = new URL(request.url).searchParams;
        const after = query.has("after") ? Number(query.get("after")) : undefined;
        const limit = query.has("limit") ? Number(query.get("limit")) : undefined;
        const page = await listAgentEvents({ runId, userId, after, limit });
        return Response.json(page, { headers: { "Cache-Control": "no-store" } });
      });
    },
  };
}
