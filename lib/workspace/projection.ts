import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listDraftFiles, readDraftFile, WorkspaceError } from "./service";
import { normalizeWorkspacePath } from "./path";

type ProjectionFile = { path: string; content: string };

export async function materializeWorkspaceFiles(files: ProjectionFile[]) {
  const seen = new Set<string>();
  for (const file of files) {
    normalizeWorkspacePath(file.path);
    if (seen.has(file.path)) throw new WorkspaceError("DUPLICATE_FILE_PATH", "Duplicate projection file path");
    seen.add(file.path);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-projection-"));
  try {
    const manifest: Array<{ path: string; sha256: string }> = [];
    for (const file of files) {
      const target = path.join(directory, file.path);
      const parent = path.dirname(target);
      await mkdir(parent, { recursive: true });
      await writeFile(target, file.content, { encoding: "utf8", flag: "wx", mode: 0o444 });
      manifest.push({ path: file.path, sha256: createHash("sha256").update(file.content).digest("hex") });
    }
    return {
      directory,
      files: manifest.sort((a, b) => a.path.localeCompare(b.path)),
      // The executor must mount this directory read-only; permissions alone do
      // not isolate a process running under the same OS user.
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function materializeDraftRevision(input: { workspaceId: string; userId: string; revision: number }) {
  const listed = await listDraftFiles(input);
  const files = await Promise.all(listed.map(async ({ path: filePath, sha256 }) => {
    const file = await readDraftFile({ ...input, path: filePath });
    if (file.sha256 !== sha256) throw new WorkspaceError("SNAPSHOT_MISMATCH", "Workspace snapshot changed during materialization");
    return { path: filePath, content: file.content };
  }));
  return materializeWorkspaceFiles(files);
}
