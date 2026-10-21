import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBoundedProcess } from "./command";
import type { WorkspaceDiagnostic } from "./diagnostics";
import { materializeWorkspaceFiles } from "./projection";

type FrontendFile = { path: string; content: string };
type BuildFailure = { ok: boolean; message?: string; errors?: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } }> };

function sourcePath(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replaceAll("\\", "/");
  const marker = "/.source/";
  const relative = normalized.includes(marker) ? normalized.slice(normalized.lastIndexOf(marker) + marker.length) : normalized;
  if (relative.startsWith("/") || relative.startsWith("__published_") || relative.split("/").includes("..")) return undefined;
  return `frontend/${relative}`;
}

async function dependencyRoot() {
  let current = process.cwd();
  for (;;) {
    try { await access(path.join(current, "node_modules/react/package.json")); return current; } catch { /* Try parent. */ }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Application dependency root not found");
    current = parent;
  }
}

export async function buildWorkspaceFrontend(files: FrontendFile[]): Promise<{ command: Awaited<ReturnType<typeof runBoundedProcess>>; diagnostics: WorkspaceDiagnostic[] }> {
  const frontend = files.filter((file) => file.path.startsWith("frontend/"));
  const projection = await materializeWorkspaceFiles(frontend);
  const output = await mkdtemp(path.join(os.tmpdir(), "workspace-frontend-build-"));
  try {
    const dependencies = await dependencyRoot();
    const command = await runBoundedProcess(process.execPath, [
      "--import", "tsx", path.join(process.cwd(), "lib/workspace/frontend-build-worker.ts"), projection.directory, output,
    ], {
      cwd: dependencies, env: { NODE_ENV: "production", PATH: process.env.PATH },
      timeoutMs: 60_000, maxOutputBytes: 32_000,
    });
    if (command.exitCode === 0) return { command, diagnostics: [] };
    if (command.timedOut) return { command, diagnostics: [{ id: "command:FRONTEND_BUILD_TIMEOUT:workspace", source: "command", severity: "error", code: "FRONTEND_BUILD_TIMEOUT", message: "Frontend build timed out" }] };
    const marker = "WORKSPACE_BUILD_RESULT ";
    const line = command.output.split(/\r?\n/).find((item) => item.startsWith(marker));
    let failure: BuildFailure | undefined;
    try { if (line) failure = JSON.parse(line.slice(marker.length)) as BuildFailure; } catch { /* Preserve raw process output below. */ }
    const issues = failure?.errors?.length ? failure.errors : [{ text: failure?.message ?? command.output }];
    const diagnostics: WorkspaceDiagnostic[] = issues.slice(0, 100).map((issue, index) => {
      const file = sourcePath(issue.location?.file);
      const message = (issue.text ?? failure?.message ?? "Frontend build failed").slice(0, 4096);
      return {
        id: `frontend:BUILD_ERROR:${file ?? "workspace"}:${index}`,
        source: "typescript", severity: "error", code: "FRONTEND_BUILD_ERROR", file,
        line: issue.location?.line, column: issue.location?.column !== undefined ? issue.location.column + 1 : undefined,
        message, raw: message,
      };
    });
    return { command, diagnostics };
  } finally {
    await projection.dispose();
    await rm(output, { recursive: true, force: true });
  }
}
