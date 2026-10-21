import type { WorkspaceDiagnostic } from "./diagnostics";

type Compiler = "typescript" | "go";
const MAX_LINES = 100;
const MAX_RAW = 4096;

export function scrubHostPaths(value: string) {
  return value.replace(/(?:\/private)?\/(?:tmp|var\/folders|Users|home|app-builds)\/[^\s:'"]+/g, "[workspace]");
}

function workspacePath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
  const marker = /(?:^|\/)(frontend|backend|migrations|acceptance)\//.exec(normalized);
  return marker ? normalized.slice(marker.index + (marker[0].startsWith("/") ? 1 : 0)) : undefined;
}

export function parseCompilerDiagnostics(source: Compiler, output: string): WorkspaceDiagnostic[] {
  const errors: WorkspaceDiagnostic[] = [];
  for (const line of output.split(/\r?\n/).filter(Boolean).slice(0, MAX_LINES)) {
    const ts = source === "typescript" ? /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line) : null;
    const go = source === "go" ? /^(.*?\.go):(\d+):(\d+): (.*)$/.exec(line) : null;
    const match = ts ?? go;
    if (!match) continue;
    const file = workspacePath(match[1]);
    const code = ts ? ts[4] : "GO_COMPILE_ERROR";
    const message = ts ? ts[5] : go![4];
    const raw = scrubHostPaths(file ? line.slice(line.indexOf(file)).slice(0, MAX_RAW) : message.slice(0, MAX_RAW));
    errors.push({
      id: `${source}:${code}:${file ?? "workspace"}:${match[2]}:${match[3]}`,
      source, severity: "error", file, line: Number(match[2]), column: Number(match[3]), code, message: scrubHostPaths(message.slice(0, MAX_RAW)), raw,
    });
  }
  if (errors.length) return errors;
  const code = source === "go" ? "GO_COMPILE_ERROR" : "TYPESCRIPT_COMPILE_ERROR";
  const raw = scrubHostPaths(output.slice(0, MAX_RAW));
  return [{ id: `${source}:${code}:workspace`, source, severity: "error", code, message: raw || "Compiler failed without diagnostic output", raw }];
}
