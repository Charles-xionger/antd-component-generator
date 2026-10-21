import { acceptanceScenarioSuiteSchema, type AppBlueprint } from "@/lib/app-contracts";
import { validateFullstackArtifact } from "@/lib/go-runtime/artifact-validator";
import { normalizeWorkspacePath } from "./path";

export type WorkspaceDiagnostic = {
  id: string;
  source: "json" | "schema" | "migration" | "contract" | "typescript" | "go" | "command";
  severity: "error";
  file?: string;
  line?: number;
  column?: number;
  path?: string;
  code: string;
  message: string;
  expected?: string;
  actual?: string;
  raw?: string;
};

type WorkspaceFile = { path: string; content: string };

function diagnostic(source: WorkspaceDiagnostic["source"], code: string, message: string, file?: string, extras: Partial<WorkspaceDiagnostic> = {}): WorkspaceDiagnostic {
  return { id: `${source}:${code}:${file ?? "workspace"}:${extras.path ?? ""}:${extras.line ?? ""}`, source, severity: "error", file, code, message, ...extras };
}

function jsonLocation(content: string, error: Error): { line?: number; column?: number } {
  const position = /position (\d+)/i.exec(error.message);
  const unexpected = /Unexpected token '([^']+)'/.exec(error.message);
  const offset = position ? Number(position[1]) : unexpected ? content.indexOf(unexpected[1]) : -1;
  if (offset >= 0) {
    const prefix = content.slice(0, offset);
    const lines = prefix.split("\n");
    return { line: lines.length, column: lines.at(-1)!.length + 1 };
  }
  const location = /line (\d+) column (\d+)/i.exec(error.message);
  return location ? { line: Number(location[1]), column: Number(location[2]) } : {};
}

export function validateJsonFile(file: string, content: string): WorkspaceDiagnostic[] {
  try {
    JSON.parse(content);
    return [];
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    return [diagnostic("json", "JSON_PARSE_ERROR", parseError.message, file, jsonLocation(content, parseError))];
  }
}

export function validateAcceptanceScenarios(content: string): WorkspaceDiagnostic[] {
  const file = "acceptance/scenarios.json";
  const parseErrors = validateJsonFile(file, content);
  if (parseErrors.length) return parseErrors;
  const value: unknown = JSON.parse(content);
  if (Array.isArray(value)) {
    return [diagnostic("schema", "SCENARIO_SUITE_ROOT_TYPE", "顶层必须是 { scenarios: [...] }", file, {
      path: "$", expected: "object with scenarios array", actual: "array",
    })];
  }
  const result = acceptanceScenarioSuiteSchema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = `$${issue.path.map((segment) => typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`).join("")}`;
    return diagnostic("schema", "SCENARIO_SUITE_SCHEMA_ERROR", issue.message, file, { path });
  });
}

export function validateWorkspaceFileContract(files: WorkspaceFile[], runtimeType: "STATIC" | "GO", blueprint?: AppBlueprint): WorkspaceDiagnostic[] {
  const errors: WorkspaceDiagnostic[] = [];
  const validFiles: WorkspaceFile[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    try {
      normalizeWorkspacePath(file.path);
    } catch {
      errors.push(diagnostic("contract", "UNSAFE_FILE_PATH", "不安全的工作区文件路径", file.path));
      continue;
    }
    if (seen.has(file.path)) {
      errors.push(diagnostic("contract", "DUPLICATE_FILE_PATH", "重复的工作区文件路径", file.path));
      continue;
    }
    seen.add(file.path);
    const allowed = runtimeType === "STATIC" ? ["frontend/"] : ["frontend/", "backend/", "migrations/", "acceptance/"];
    if (!allowed.some((prefix) => file.path.startsWith(prefix))) {
      errors.push(diagnostic("contract", "FILE_PATH_NOT_ALLOWED", "文件路径不在当前运行时允许的目录中", file.path));
      continue;
    }
    validFiles.push(file);
  }
  if (!seen.has("frontend/App.tsx")) errors.push(diagnostic("contract", "REQUIRED_FILE_MISSING", "缺少 frontend/App.tsx", "frontend/App.tsx"));
  if (runtimeType === "STATIC") return errors;

  // Reuse the existing file-level contract checks; unlike validateGeneratedArtifact,
  // this entry point does not inspect or require a text/XML envelope.
  for (const message of validateFullstackArtifact(validFiles, blueprint)) {
    if (message === "缺少 frontend/App.tsx") continue;
    if (message === "acceptance/scenarios.json 不符合验收场景契约") continue;
    const file = validFiles.find((candidate) => message.startsWith(`${candidate.path}:`))?.path;
    const missing = /^缺少 (backend\/operations\.go|acceptance\/scenarios\.json)/.exec(message);
    const target = file ?? missing?.[1];
    const source = file?.endsWith(".sql") ? "migration" : "contract";
    const code = missing ? "REQUIRED_FILE_MISSING" : source === "migration" ? "MIGRATION_INVALID" : "CONTRACT_INVALID";
    errors.push(diagnostic(source, code, message, target));
  }
  const scenario = validFiles.find((file) => file.path === "acceptance/scenarios.json");
  if (scenario) errors.push(...validateAcceptanceScenarios(scenario.content));
  return errors;
}
