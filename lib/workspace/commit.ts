import { appBlueprintSchema, CURRENT_GO_RUNTIME } from "@/lib/app-contracts";
import prisma from "@/lib/database/prisma";
import { appendAgentEvent } from "./events";
import { WorkspaceError } from "./service";
import { validationContextDigest } from "./validation-context";

export async function commitValidatedWorkspace(input: {
  runId: string;
  userId: string;
  revision: number;
  validationRunId: string;
  description?: string;
}) {
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new WorkspaceError("INVALID_REVISION", "Invalid workspace revision");
  // One workspace yields at most one immutable version. A retry after commit
  // returns the same version and preview job even if the draft is now closed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const run = await tx.agentRun.findFirst({
          where: { id: input.runId, workspace: { project: { userId: input.userId, status: "ACTIVE" } } },
        });
        if (!run) throw new WorkspaceError("NOT_FOUND", "Agent run not found");
        const workspace = await tx.draftWorkspace.findFirst({
          where: { id: run.workspaceId, project: { userId: input.userId, status: "ACTIVE" } },
          include: { baseArtifactVersion: true },
        });
        if (!workspace) throw new WorkspaceError("NOT_FOUND", "Workspace not found");
        const generationRequestId = `workspace:${workspace.id}`;
        const existing = await tx.artifactVersion.findUnique({ where: { generationRequestId }, include: { files: true } });
        if (existing) {
          if (workspace.revision !== input.revision || run.status !== "COMMITTED" || (existing.runtimeVersion ? "GO" : "STATIC") !== run.runtimeType) {
            throw new WorkspaceError("COMMIT_CONFLICT", "A different workspace revision or runtime was already committed");
          }
          const previewJob = existing.runtimeVersion
            ? await tx.buildJob.findFirst({ where: { artifactVersionId: existing.id, type: "FULLSTACK_PREVIEW" }, orderBy: { createdAt: "asc" } })
            : null;
          return { version: existing, previewJob, repeated: true };
        }
        if (run.status !== "READY_TO_VALIDATE") throw new WorkspaceError("RUN_NOT_READY", "Agent run has not finished writing");
        if (workspace.status !== "ACTIVE" || workspace.revision !== input.revision) throw new WorkspaceError("REVISION_CONFLICT", "Workspace changed after validation");
        const validation = await tx.draftValidationRun.findUnique({ where: { id: input.validationRunId } });
        const blueprintValue = run.appBlueprint ?? workspace.baseArtifactVersion?.appBlueprint;
        if (!validation || validation.workspaceId !== workspace.id || validation.revision !== input.revision || validation.runtimeType !== run.runtimeType || validation.contextDigest !== validationContextDigest(run.runtimeType, blueprintValue) || validation.status !== "PASSED" || !Array.isArray(validation.diagnostics) || validation.diagnostics.length) {
          throw new WorkspaceError("VALIDATION_REQUIRED", "Current workspace revision has not passed validation");
        }
        // File tools lock the AgentRun lease before the DraftWorkspace row.
        // Commit uses the same lock order to avoid a write/commit deadlock.
        const committed = await tx.agentRun.updateMany({ where: { id: run.id, status: "READY_TO_VALIDATE" }, data: { status: "COMMITTED" } });
        if (committed.count !== 1) throw new WorkspaceError("RUN_NOT_READY", "Agent run changed during commit");
        // This CAS update locks the workspace row for the rest of the transaction.
        // File tools require ACTIVE + exact revision, so no later write can enter
        // between taking the snapshot and creating the version.
        const closed = await tx.draftWorkspace.updateMany({ where: { id: workspace.id, status: "ACTIVE", revision: input.revision }, data: { status: "CLOSED" } });
        if (closed.count !== 1) throw new WorkspaceError("REVISION_CONFLICT", "Workspace changed during commit");
        const files = await tx.draftFile.findMany({ where: { workspaceId: workspace.id }, orderBy: { path: "asc" } });
        const blueprint = run.runtimeType === "GO" ? appBlueprintSchema.parse(blueprintValue) : blueprintValue;
        if (run.runtimeType === "GO" && appBlueprintSchema.parse(blueprint).runtimeType !== "GO") throw new WorkspaceError("INVALID_BLUEPRINT", "Go workspace requires a Go blueprint");
        const seed = files.find((file) => file.path === "acceptance/seed.json");
        const seedData = seed ? JSON.parse(seed.content) : {};
        const runtimeManifest = run.runtimeType === "GO" ? {
          runtimeVersion: CURRENT_GO_RUNTIME,
          frontendEntry: "frontend/App.tsx",
          migrationDirectory: "migrations",
          operations: (blueprint as ReturnType<typeof appBlueprintSchema.parse>).operations,
          seedData,
        } : undefined;
        const artifact = await tx.artifact.upsert({ where: { projectId: workspace.projectId }, create: { projectId: workspace.projectId }, update: {} });
        const latest = await tx.artifactVersion.findFirst({ where: { artifactId: artifact.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
        const version = await tx.artifactVersion.create({
          data: {
            artifactId: artifact.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            generationRequestId,
            description: input.description ?? "Workspace Agent 提交",
            requirementSpec: (run.requirementSpec ?? workspace.baseArtifactVersion?.requirementSpec) as never,
            appBlueprint: blueprint as never,
            runtimeManifest: runtimeManifest as never,
            runtimeVersion: run.runtimeType === "GO" ? CURRENT_GO_RUNTIME : undefined,
            fileManifest: files.map((file) => file.path),
            files: { create: files.map((file) => ({ path: file.path, content: file.content })) },
          },
          include: { files: true },
        });
        const previewJob = run.runtimeType === "GO"
          ? await tx.buildJob.create({ data: { projectId: workspace.projectId, artifactVersionId: version.id, type: "FULLSTACK_PREVIEW" } })
          : null;
        await appendAgentEvent(tx, { runId: run.id, type: "artifact.committed", itemId: version.id, payload: { workspaceId: workspace.id, revision: input.revision, artifactVersionId: version.id, previewJobId: previewJob?.id ?? null, runtimeType: run.runtimeType } });
        return { version, previewJob, repeated: false };
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && (error.code === "P2002" || error.code === "P2034" || error.code === "REVISION_CONFLICT" || error.code === "RUN_NOT_READY") && attempt < 2) continue;
      throw error;
    }
  }
  throw new WorkspaceError("COMMIT_CONFLICT", "Could not commit workspace version");
}
