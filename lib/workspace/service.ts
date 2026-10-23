import { createHash } from "node:crypto";
import prisma from "@/lib/database/prisma";
import { appendAgentEvent } from "./events";
import { WorkspaceError } from "./errors";
import { normalizeWorkspacePath } from "./path";

export { WorkspaceError } from "./errors";

const MAX_FILE_BYTES = 1024 * 1024;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type AgentLease = { runId: string; leaseToken: string };

async function fenceAgentLease(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], workspaceId: string, agentLease?: AgentLease) {
  if (!agentLease) return;
  const fenced = await tx.agentRun.updateMany({
    where: { id: agentLease.runId, workspaceId, status: "RUNNING", leaseToken: agentLease.leaseToken, leaseUntil: { gt: new Date() } },
    data: { leaseUntil: new Date(Date.now() + 120_000) },
  });
  if (fenced.count !== 1) throw new WorkspaceError("RUN_LEASE_LOST", "Agent run lease was lost before file write");
}

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

  const active = await prisma.draftWorkspace.findFirst({ where: { projectId: input.projectId, status: "ACTIVE" }, select: { taskId: true } });
  if (active && active.taskId !== input.taskId) throw new WorkspaceError("WORKSPACE_BUSY", "Another draft workspace is active for this project");

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
      if (raced) throw new WorkspaceError("TASK_CONFLICT", "Task ID already belongs to another workspace");
      throw new WorkspaceError("WORKSPACE_BUSY", "Another draft workspace is active for this project");
    }
    throw error;
  }
}

export async function closeDraftWorkspace(input: { workspaceId: string; userId: string }) {
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  if (workspace.status === "CLOSED") return workspace;
  return prisma.draftWorkspace.update({ where: { id: workspace.id }, data: { status: "CLOSED" } });
}

export async function listDraftFiles(input: { workspaceId: string; userId: string; revision?: number }) {
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  const revision = input.revision ?? workspace.revision;
  if (!Number.isInteger(revision) || revision < 0 || revision > workspace.revision) throw new WorkspaceError("INVALID_REVISION", "Invalid workspace revision");
  // A current-file read could race with the next write after we captured the
  // workspace revision. Immutable revision rows keep this snapshot coherent.
  const history = await prisma.draftFileRevision.findMany({
    where: { workspaceId: workspace.id, revision: { lte: revision } },
    select: { path: true, sha256: true, revision: true },
    orderBy: [{ revision: "asc" }, { path: "asc" }],
  });
  const files = new Map<string, { path: string; sha256: string; revision: number }>();
  for (const row of history) {
    if (row.sha256 === null) files.delete(row.path);
    else files.set(row.path, { path: row.path, sha256: row.sha256, revision: row.revision });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export async function readDraftFile(input: { workspaceId: string; userId: string; path: string; revision?: number }): Promise<{ path: string; content: string; sha256: string; revision: number }> {
  const path = normalizeWorkspacePath(input.path);
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  const revision = input.revision ?? workspace.revision;
  if (!Number.isInteger(revision) || revision < 0 || revision > workspace.revision) throw new WorkspaceError("INVALID_REVISION", "Invalid workspace revision");
  // Always read the immutable history: a concurrent write may advance the
  // mutable DraftFile row between reading workspace.revision and this query.
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
  operation: "write" | "patch" | "rewrite";
  agentLease?: AgentLease;
  rewriteAudit?: { reason: string; exception: "patch_conflicts" | "broad_replacement" };
}) {
  const path = normalizeWorkspacePath(input.path);
  if (!input.toolCallId || input.toolCallId.length > 128) throw new WorkspaceError("INVALID_TOOL_CALL", "Invalid tool call ID");
  if (typeof input.content !== "string" || !input.content.isWellFormed() || Buffer.byteLength(input.content, "utf8") > MAX_FILE_BYTES || input.content.includes("\0")) {
    throw new WorkspaceError("INVALID_CONTENT", "File content is invalid or too large");
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new WorkspaceError("INVALID_REVISION", "Invalid expected revision");
  await ownedWorkspace(input.workspaceId, input.userId);
  const sha256 = hash(input.content);
  const inputHash = hash(JSON.stringify({ operation: input.operation, path, sha256, expectedRevision: input.expectedRevision, rewriteAudit: input.rewriteAudit }));

  const execute = () => prisma.$transaction(async (tx) => {
    const receipt = await tx.draftWriteReceipt.findUnique({ where: { workspaceId_toolCallId: { workspaceId: input.workspaceId, toolCallId: input.toolCallId } } });
    if (receipt) {
      if (receipt.inputHash !== inputHash) throw new WorkspaceError("TOOL_CALL_CONFLICT", "Tool call ID reused with different arguments");
      return { revision: receipt.revision, path: receipt.path, sha256: receipt.sha256, repeated: true };
    }
    await fenceAgentLease(tx, input.workspaceId, input.agentLease);
    const before = await tx.draftFile.findUnique({
      where: { workspaceId_path: { workspaceId: input.workspaceId, path } },
      select: { sha256: true, content: true },
    });
    const updated = await tx.draftWorkspace.updateMany({
      where: { id: input.workspaceId, revision: input.expectedRevision, status: "ACTIVE" },
      data: { revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new WorkspaceError("REVISION_CONFLICT", "Workspace revision has changed");
    if (input.operation === "write" && before?.content) {
      throw new WorkspaceError("PATCH_REQUIRED", `${path} already exists and is non-empty; use read_file_range and patch_file`, {
        requiredEvidence: ["current-revision location", "bounded read covering the patch target"],
        allowedNextActions: ["search_files", "read_file_range", "patch_file"],
      });
    }
    const revision = input.expectedRevision + 1;
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
    if (input.agentLease) await appendAgentEvent(tx, { runId: input.agentLease.runId, type: "file.changed", itemId: input.toolCallId, toolCallId: input.toolCallId, payload: { workspaceId: input.workspaceId, path, beforeRevision: input.expectedRevision, revision, beforeSha256: before?.sha256 ?? null, afterSha256: sha256 } });
    if (input.agentLease && input.rewriteAudit) await appendAgentEvent(tx, {
      runId: input.agentLease.runId,
      type: "file.rewritten",
      itemId: input.toolCallId,
      toolCallId: input.toolCallId,
      payload: {
        path,
        beforeSha256: before?.sha256 ?? null,
        afterSha256: sha256,
        revision,
        reason: input.rewriteAudit.reason,
        exception: input.rewriteAudit.exception,
        validationStatus: "pending",
      },
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
  agentLease?: AgentLease;
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
  agentLease?: AgentLease;
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

export async function rewriteDraftFile(input: {
  workspaceId: string;
  userId: string;
  toolCallId: string;
  expectedRevision: number;
  path: string;
  content: string;
  expectedSha256: string;
  reason: string;
  exception: "patch_conflicts" | "broad_replacement";
  agentLease?: AgentLease;
}) {
  const before = await readDraftFile({ workspaceId: input.workspaceId, userId: input.userId, path: input.path, revision: input.expectedRevision });
  if (before.sha256 !== input.expectedSha256) throw new WorkspaceError("REVISION_CONFLICT", "Guarded rewrite expectedSha256 does not match the current file");
  const result = await writeDraftFileInternal({ ...input, content: input.content, operation: "rewrite", rewriteAudit: { reason: input.reason, exception: input.exception } });
  return { ...result, guardedRewrite: true, exception: input.exception, auditItemId: input.toolCallId };
}

export async function deleteDraftFile(input: {
  workspaceId: string;
  userId: string;
  toolCallId: string;
  expectedRevision: number;
  path: string;
  agentLease?: AgentLease;
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
      await fenceAgentLease(tx, input.workspaceId, input.agentLease);
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
      if (input.agentLease) await appendAgentEvent(tx, { runId: input.agentLease.runId, type: "file.changed", itemId: input.toolCallId, toolCallId: input.toolCallId, payload: { workspaceId: input.workspaceId, path, beforeRevision: input.expectedRevision, revision, beforeSha256: before.sha256, afterSha256: null } });
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
  pathGlob?: string;
  mode?: "literal" | "regex";
  contextLines?: number;
  maxResults?: number;
}) {
  if (typeof input.query !== "string" || !input.query || input.query.length > 512 || input.query.includes("\0")) throw new WorkspaceError("INVALID_QUERY", "Invalid search query");
  const mode = input.mode ?? "literal";
  const contextLines = input.contextLines ?? 0;
  const maxResults = input.maxResults ?? 100;
  if (mode !== "literal" && mode !== "regex") throw new WorkspaceError("INVALID_QUERY", "Search mode must be literal or regex");
  if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 8) throw new WorkspaceError("INVALID_QUERY", "Search contextLines must be 0 to 8");
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new WorkspaceError("INVALID_QUERY", "Search result limit must be 1 to 100");
  if (input.pathGlob !== undefined && (!input.pathGlob || input.pathGlob.length > 256 || input.pathGlob.includes("\0") || input.pathGlob.startsWith("/") || input.pathGlob.split("/").includes(".."))) {
    throw new WorkspaceError("INVALID_QUERY", "Invalid search pathGlob");
  }
  let matcher: RegExp | null = null;
  try { matcher = mode === "regex" ? new RegExp(input.query) : null; } catch { throw new WorkspaceError("INVALID_QUERY", "Invalid regular expression"); }
  const globRegex = input.pathGlob ? globToRegExp(input.pathGlob) : null;
  const workspace = await ownedWorkspace(input.workspaceId, input.userId);
  const revision = input.revision ?? workspace.revision;
  const files = await listDraftFiles({ ...input, revision });
  const hits: { path: string; line: number; text: string; before: string[]; after: string[] }[] = [];
  let truncated = false;
  for (const listed of files) {
    if (globRegex && !globRegex.test(listed.path)) continue;
    const file = await readDraftFile({ ...input, path: listed.path, revision });
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const matched = matcher ? (matcher.lastIndex = 0, matcher.test(lines[index])) : lines[index].includes(input.query);
      if (!matched) continue;
      if (hits.length === maxResults) { truncated = true; break; }
      hits.push({
        path: listed.path,
        line: index + 1,
        text: lines[index].slice(0, 400),
        before: lines.slice(Math.max(0, index - contextLines), index).map((line) => line.slice(0, 400)),
        after: lines.slice(index + 1, index + 1 + contextLines).map((line) => line.slice(0, 400)),
      });
    }
    if (truncated) break;
  }
  return { revision, hits, truncated };
}

function globToRegExp(glob: string) {
  let source = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        index += 1;
        if (glob[index + 1] === "/") { index += 1; source += "(?:.*/)?"; }
        else source += ".*";
      } else source += "[^/]*";
    } else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  try { return new RegExp(`${source}$`); } catch { throw new WorkspaceError("INVALID_QUERY", "Invalid search pathGlob"); }
}
