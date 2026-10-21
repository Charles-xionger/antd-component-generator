import { createHash } from "node:crypto";
import prisma from "@/lib/database/prisma";
import { normalizeWorkspacePath } from "./path";

const MAX_FILE_BYTES = 1024 * 1024;

export class WorkspaceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function ownedWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.draftWorkspace.findFirst({
    where: { id: workspaceId, project: { userId, status: "ACTIVE" } },
  });
  if (!workspace) throw new WorkspaceError("NOT_FOUND", "Workspace not found");
  return workspace;
}

export async function createDraftWorkspace(input: {
  projectId: string;
  userId: string;
  taskId: string;
  baseArtifactVersionId?: string;
}) {
  if (!input.taskId || input.taskId.length > 128) throw new WorkspaceError("INVALID_TASK", "Invalid task ID");
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId, status: "ACTIVE" },
  });
  if (!project) throw new WorkspaceError("NOT_FOUND", "Project not found");

  const existing = await prisma.draftWorkspace.findUnique({ where: { taskId: input.taskId } });
  if (existing) {
    if (existing.projectId !== input.projectId || existing.baseArtifactVersionId !== (input.baseArtifactVersionId ?? null)) {
      throw new WorkspaceError("TASK_CONFLICT", "Task ID already belongs to another workspace");
    }
    return existing;
  }

  const base = input.baseArtifactVersionId
    ? await prisma.artifactVersion.findFirst({
        where: { id: input.baseArtifactVersionId, artifact: { projectId: input.projectId } },
        include: { files: true },
      })
    : null;
  if (input.baseArtifactVersionId && !base) throw new WorkspaceError("NOT_FOUND", "Base version not found");

  try {
    return await prisma.draftWorkspace.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId,
        baseArtifactVersionId: input.baseArtifactVersionId,
        files: { create: (base?.files ?? []).map((file) => ({ path: normalizeWorkspacePath(file.path), content: file.content, sha256: hash(file.content), revision: 0 })) },
        fileRevisions: { create: (base?.files ?? []).map((file) => ({ path: normalizeWorkspacePath(file.path), content: file.content, sha256: hash(file.content), revision: 0 })) },
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const raced = await prisma.draftWorkspace.findUnique({ where: { taskId: input.taskId } });
      if (raced?.projectId === input.projectId && raced.baseArtifactVersionId === (input.baseArtifactVersionId ?? null)) return raced;
      throw new WorkspaceError("TASK_CONFLICT", "Task ID already belongs to another workspace");
    }
    throw error;
  }
}

export async function listDraftFiles(input: { workspaceId: string; userId: string; revision?: number }) {
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  const revision = input.revision ?? workspace.revision;
  if (!Number.isInteger(revision) || revision < 0 || revision > workspace.revision) throw new WorkspaceError("INVALID_REVISION", "Invalid workspace revision");
  if (revision === workspace.revision) {
    return prisma.draftFile.findMany({ where: { workspaceId: workspace.id }, select: { path: true, sha256: true, revision: true }, orderBy: { path: "asc" } });
  }
  const history = await prisma.draftFileRevision.findMany({ where: { workspaceId: workspace.id, revision: { lte: revision } }, orderBy: [{ revision: "asc" }, { path: "asc" }] });
  const files = new Map<string, { path: string; sha256: string; revision: number }>();
  for (const row of history) {
    if (row.content === null) files.delete(row.path);
    else files.set(row.path, { path: row.path, sha256: row.sha256!, revision: row.revision });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export async function readDraftFile(input: { workspaceId: string; userId: string; path: string; revision?: number }): Promise<{ path: string; content: string; sha256: string; revision: number }> {
  const path = normalizeWorkspacePath(input.path);
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  const revision = input.revision ?? workspace.revision;
  if (!Number.isInteger(revision) || revision < 0 || revision > workspace.revision) throw new WorkspaceError("INVALID_REVISION", "Invalid workspace revision");
  if (revision === workspace.revision) {
    const file = await prisma.draftFile.findUnique({ where: { workspaceId_path: { workspaceId: workspace.id, path } } });
    if (!file) throw new WorkspaceError("FILE_NOT_FOUND", "File not found");
    return file;
  }
  const file = await prisma.draftFileRevision.findFirst({ where: { workspaceId: workspace.id, path, revision: { lte: revision } }, orderBy: { revision: "desc" } });
  if (!file || file.content === null || file.sha256 === null) throw new WorkspaceError("FILE_NOT_FOUND", "File not found");
  return { path: file.path, content: file.content, sha256: file.sha256, revision: file.revision };
}

async function writeDraftFileInternal(input: {
  workspaceId: string;
  userId: string;
  toolCallId: string;
  expectedRevision: number;
  path: string;
  content: string;
  operation: "write" | "patch";
}) {
  const path = normalizeWorkspacePath(input.path);
  if (!input.toolCallId || input.toolCallId.length > 128) throw new WorkspaceError("INVALID_TOOL_CALL", "Invalid tool call ID");
  if (typeof input.content !== "string" || Buffer.byteLength(input.content, "utf8") > MAX_FILE_BYTES || input.content.includes("\0")) {
    throw new WorkspaceError("INVALID_CONTENT", "File content is invalid or too large");
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new WorkspaceError("INVALID_REVISION", "Invalid expected revision");
  await ownedWorkspace(input.workspaceId, input.userId);
  const sha256 = hash(input.content);
  const inputHash = hash(JSON.stringify({ operation: input.operation, path, sha256, expectedRevision: input.expectedRevision }));

  const execute = () => prisma.$transaction(async (tx) => {
    const receipt = await tx.draftWriteReceipt.findUnique({ where: { workspaceId_toolCallId: { workspaceId: input.workspaceId, toolCallId: input.toolCallId } } });
    if (receipt) {
      if (receipt.inputHash !== inputHash) throw new WorkspaceError("TOOL_CALL_CONFLICT", "Tool call ID reused with different arguments");
      return { revision: receipt.revision, path: receipt.path, sha256: receipt.sha256, repeated: true };
    }
    const updated = await tx.draftWorkspace.updateMany({
      where: { id: input.workspaceId, revision: input.expectedRevision, status: "ACTIVE" },
      data: { revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new WorkspaceError("REVISION_CONFLICT", "Workspace revision has changed");
    const revision = input.expectedRevision + 1;
    const before = await tx.draftFile.findUnique({
      where: { workspaceId_path: { workspaceId: input.workspaceId, path } },
      select: { sha256: true },
    });
    await tx.draftFile.upsert({
      where: { workspaceId_path: { workspaceId: input.workspaceId, path } },
      create: { workspaceId: input.workspaceId, path, content: input.content, sha256, revision },
      update: { content: input.content, sha256, revision },
    });
    await tx.draftFileRevision.create({ data: { workspaceId: input.workspaceId, path, content: input.content, sha256, revision } });
    await tx.draftWriteReceipt.create({ data: { workspaceId: input.workspaceId, toolCallId: input.toolCallId, inputHash, path, sha256, revision } });
    await tx.draftFileChange.create({
      data: { workspaceId: input.workspaceId, revision, toolCallId: input.toolCallId, path, beforeSha256: before?.sha256, afterSha256: sha256 },
    });
    return { revision, path, sha256, repeated: false };
  });

  try { return await execute(); } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
      const receipt = await prisma.draftWriteReceipt.findUnique({ where: { workspaceId_toolCallId: { workspaceId: input.workspaceId, toolCallId: input.toolCallId } } });
      if (receipt) {
        if (receipt.inputHash !== inputHash) throw new WorkspaceError("TOOL_CALL_CONFLICT", "Tool call ID reused with different arguments");
        return { revision: receipt.revision, path: receipt.path, sha256: receipt.sha256, repeated: true };
      }
      throw new WorkspaceError("REVISION_CONFLICT", "Workspace revision has changed");
    }
    throw error;
  }
}

export function writeDraftFile(input: {
  workspaceId: string;
  userId: string;
  toolCallId: string;
  expectedRevision: number;
  path: string;
  content: string;
}) {
  return writeDraftFileInternal({ ...input, operation: "write" });
}

export async function patchDraftFile(input: {
  workspaceId: string;
  userId: string;
  toolCallId: string;
  expectedRevision: number;
  path: string;
  oldText: string;
  newText: string;
}) {
  if (!input.oldText || typeof input.newText !== "string") throw new WorkspaceError("INVALID_PATCH", "Patch requires a non-empty old text and replacement text");
  const file = await readDraftFile({ workspaceId: input.workspaceId, userId: input.userId, path: input.path, revision: input.expectedRevision });
  const first = file.content.indexOf(input.oldText);
  if (first < 0 || file.content.indexOf(input.oldText, first + input.oldText.length) >= 0) {
    throw new WorkspaceError("PATCH_CONFLICT", "Patch target must occur exactly once");
  }
  const content = file.content.slice(0, first) + input.newText + file.content.slice(first + input.oldText.length);
  return writeDraftFileInternal({ ...input, content, operation: "patch" });
}

export async function deleteDraftFile(input: {
  workspaceId: string;
  userId: string;
  toolCallId: string;
  expectedRevision: number;
  path: string;
}) {
  const path = normalizeWorkspacePath(input.path);
  if (!input.toolCallId || input.toolCallId.length > 128) throw new WorkspaceError("INVALID_TOOL_CALL", "Invalid tool call ID");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new WorkspaceError("INVALID_REVISION", "Invalid expected revision");
  await ownedWorkspace(input.workspaceId, input.userId);
  const inputHash = hash(JSON.stringify({ operation: "delete", path, expectedRevision: input.expectedRevision }));
  const receiptKey = { workspaceId_toolCallId: { workspaceId: input.workspaceId, toolCallId: input.toolCallId } };
  try {
    return await prisma.$transaction(async (tx) => {
      const receipt = await tx.draftWriteReceipt.findUnique({ where: receiptKey });
      if (receipt) {
        if (receipt.inputHash !== inputHash) throw new WorkspaceError("TOOL_CALL_CONFLICT", "Tool call ID reused with different arguments");
        return { revision: receipt.revision, path: receipt.path, repeated: true };
      }
      const updated = await tx.draftWorkspace.updateMany({
        where: { id: input.workspaceId, revision: input.expectedRevision, status: "ACTIVE" },
        data: { revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new WorkspaceError("REVISION_CONFLICT", "Workspace revision has changed");
      const before = await tx.draftFile.findUnique({ where: { workspaceId_path: { workspaceId: input.workspaceId, path } }, select: { sha256: true } });
      if (!before) throw new WorkspaceError("FILE_NOT_FOUND", "File not found");
      const revision = input.expectedRevision + 1;
      await tx.draftFile.delete({ where: { workspaceId_path: { workspaceId: input.workspaceId, path } } });
      await tx.draftFileRevision.create({ data: { workspaceId: input.workspaceId, path, revision, content: null, sha256: null } });
      await tx.draftWriteReceipt.create({ data: { workspaceId: input.workspaceId, toolCallId: input.toolCallId, inputHash, path, revision, sha256: "" } });
      await tx.draftFileChange.create({ data: { workspaceId: input.workspaceId, revision, toolCallId: input.toolCallId, path, beforeSha256: before.sha256, afterSha256: null } });
      return { revision, path, repeated: false };
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
      const receipt = await prisma.draftWriteReceipt.findUnique({ where: receiptKey });
      if (receipt) {
        if (receipt.inputHash !== inputHash) throw new WorkspaceError("TOOL_CALL_CONFLICT", "Tool call ID reused with different arguments");
        return { revision: receipt.revision, path: receipt.path, repeated: true };
      }
      throw new WorkspaceError("REVISION_CONFLICT", "Workspace revision has changed");
    }
    throw error;
  }
}

export async function readDraftFileRange(input: {
  workspaceId: string;
  userId: string;
  path: string;
  revision?: number;
  startLine: number;
  endLine: number;
}) {
  if (!Number.isInteger(input.startLine) || !Number.isInteger(input.endLine) || input.startLine < 1 || input.endLine < input.startLine || input.endLine - input.startLine >= 400) {
    throw new WorkspaceError("INVALID_RANGE", "Line range must contain 1 to 400 lines");
  }
  const file = await readDraftFile(input);
  const lines = file.content.split(/\r?\n/);
  if (input.startLine > lines.length) throw new WorkspaceError("INVALID_RANGE", "Line range starts beyond end of file");
  const endLine = Math.min(input.endLine, lines.length);
  return { path: file.path, startLine: input.startLine, endLine, totalLines: lines.length, content: lines.slice(input.startLine - 1, endLine).join("\n") };
}

export async function searchDraftFiles(input: {
  workspaceId: string;
  userId: string;
  query: string;
  revision?: number;
  maxResults?: number;
}) {
  if (typeof input.query !== "string" || !input.query || input.query.length > 512 || input.query.includes("\0")) throw new WorkspaceError("INVALID_QUERY", "Invalid search query");
  const maxResults = input.maxResults ?? 100;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new WorkspaceError("INVALID_QUERY", "Search result limit must be 1 to 100");
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  const revision = input.revision ?? workspace.revision;
  const files = await listDraftFiles({ ...input, revision });
  const hits: { path: string; line: number; text: string }[] = [];
  for (const listed of files) {
    const file = await readDraftFile({ ...input, path: listed.path, revision });
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(input.query)) hits.push({ path: listed.path, line: index + 1, text: lines[index].slice(0, 400) });
      if (hits.length === maxResults) return hits;
    }
  }
  return hits;
}
