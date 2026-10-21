import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBoundedProcess } from "./command";
import { parseCompilerDiagnostics } from "./compiler-diagnostics";
import type { WorkspaceDiagnostic } from "./diagnostics";
import { normalizeWorkspacePath } from "./path";
import { WorkspaceError } from "./service";

type BackendFile = { path: string; content: string };

export async function compileBackendGo(files: BackendFile[]): Promise<{ command: Awaited<ReturnType<typeof runBoundedProcess>>; diagnostics: WorkspaceDiagnostic[] }> {
  const backend = files.filter((file) => file.path.startsWith("backend/") && file.path.endsWith(".go"));
  for (const file of backend) {
    normalizeWorkspacePath(file.path);
    if (file.path === "backend/runtime.go" || file.path === "backend/register.go") {
      throw new WorkspaceError("PROTECTED_SCAFFOLD_FILE", "Generated files cannot replace protected Go scaffold code");
    }
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-go-check-"));
  try {
    await cp(path.join(process.cwd(), "runtime/go-scaffold"), directory, { recursive: true });
    for (const file of backend) {
      const target = path.join(directory, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    const command = await runBoundedProcess("go", ["build", "./..."], {
      cwd: directory,
      env: {
        NODE_ENV: "production", PATH: process.env.PATH,
        CGO_ENABLED: "0", GOTOOLCHAIN: "local", GOPROXY: "off", GOWORK: "off", GOENV: "off",
        GOCACHE: path.join(directory, ".go-cache"), GOMODCACHE: path.join(os.homedir(), "go/pkg/mod"),
      },
      timeoutMs: 60_000,
      maxOutputBytes: 32_000,
    });
    const diagnostics = command.exitCode === 0 ? [] : command.timedOut
      ? [{ id: "command:GO_BUILD_TIMEOUT:workspace", source: "command" as const, severity: "error" as const, code: "GO_BUILD_TIMEOUT", message: "Go compile timed out" }]
      : parseCompilerDiagnostics("go", command.output);
    return { command, diagnostics };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
