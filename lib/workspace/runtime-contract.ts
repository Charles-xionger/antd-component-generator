import { WorkspaceError } from "./errors";
import { normalizeWorkspacePath } from "./path";

export type WorkspaceRuntimeType = "STATIC" | "GO";

export type WorkspacePolicyError = {
  code: "OBSERVATION_REQUIRED" | "PATCH_REQUIRED" | "VALIDATION_REQUIRED";
  message: string;
  requiredEvidence: string[];
  allowedNextActions: string[];
};

export type WorkspacePolicyEvidence = {
  revision: number;
  locatedPaths: Set<string>;
  ranges: Array<{ path: string; startLine: number; endLine: number; content: string }>;
  fullReads: Map<string, string>;
  patchConflicts: Map<string, number>;
  rewriteDebt: { path: string; revision: number; auditItemId: string } | null;
  fingerprint: string;
};

export type WorkspacePolicyAction = {
  action: string;
  path?: string;
  oldText?: string;
  fileExists?: boolean;
  fileIsEmpty?: boolean;
  expectedSha256?: string;
  reason?: string;
  replacementRatio?: number;
};

const policyError = (code: WorkspacePolicyError["code"], message: string, requiredEvidence: string[], allowedNextActions: string[]): WorkspacePolicyError => ({
  code, message, requiredEvidence, allowedNextActions,
});

export function evaluateWorkspacePolicy(action: WorkspacePolicyAction, evidence: WorkspacePolicyEvidence): WorkspacePolicyError | null {
  if (evidence.rewriteDebt && !new Set(["search_files", "read_file", "read_file_range", "inspect_diagnostics", "run_command", "validate_workspace"]).has(action.action)) {
    return policyError("VALIDATION_REQUIRED", `Guarded rewrite of ${evidence.rewriteDebt.path} must pass targeted validation before another mutation or completion`, ["successful targeted validation for the rewritten revision"], ["run_command", "validate_workspace", "inspect_diagnostics"]);
  }
  if (action.action === "write_file" || action.action === "write_json_file" || action.action === "write_scenarios") {
    if (action.fileExists && !action.fileIsEmpty) {
      return policyError("PATCH_REQUIRED", `${action.path} already exists and is non-empty; use a local patch`, ["current-revision location", "bounded read covering the patch target"], ["search_files", "read_file_range", "patch_file"]);
    }
    return null;
  }
  if (action.action === "patch_file") {
    const path = action.path ?? "";
    if (!evidence.locatedPaths.has(path)) {
      return policyError("OBSERVATION_REQUIRED", `${path} has not been located at workspace revision ${evidence.revision}`, ["current-revision search hit or precise diagnostic", "bounded read covering the patch target"], ["search_files", "read_file_range"]);
    }
    const observed = evidence.ranges.some((range) => range.path === path && typeof action.oldText === "string" && range.content.includes(action.oldText));
    if (!observed) {
      return policyError("OBSERVATION_REQUIRED", `The patch target in ${path} is outside the bounded ranges observed at workspace revision ${evidence.revision}`, ["bounded read covering oldText"], ["read_file_range"]);
    }
    return null;
  }
  if (action.action === "rewrite_file") {
    const path = action.path ?? "";
    if (!action.fileExists || action.fileIsEmpty) return policyError("PATCH_REQUIRED", "Guarded rewrite is only for existing non-empty files", ["existing non-empty target"], ["write_file"]);
    const readHash = evidence.fullReads.get(path);
    if (!readHash || readHash !== action.expectedSha256) {
      return policyError("OBSERVATION_REQUIRED", `${path} must be fully read at the current revision and expectedSha256 must match`, ["current-revision full read", "matching expectedSha256"], ["read_file"]);
    }
    if (!action.reason?.trim()) return policyError("PATCH_REQUIRED", "Guarded rewrite requires a non-empty reason", ["rewrite reason"], ["rewrite_file"]);
    const conflicts = evidence.patchConflicts.get(path) ?? 0;
    if (conflicts < 2 && (action.replacementRatio ?? 0) < 0.6) {
      return policyError("PATCH_REQUIRED", "Guarded rewrite requires two patch conflicts or an objectively broad replacement", ["two PATCH_CONFLICT results or replacement ratio of at least 60%"], ["read_file_range", "patch_file"]);
    }
  }
  return null;
}

export function isTargetedValidationForPath(path: string, action: string, command?: unknown) {
  if (action === "validate_workspace") return true;
  if (action !== "run_command") return false;
  if (path.startsWith("frontend/")) return command === "typecheck_frontend" || command === "build_frontend";
  if (path.startsWith("backend/") || path.startsWith("migrations/")) return command === "build_backend";
  return false;
}

const ALLOWED_ROOTS: Record<WorkspaceRuntimeType, readonly string[]> = {
  STATIC: ["frontend/"],
  GO: ["frontend/", "backend/", "migrations/", "acceptance/"],
};

const PLATFORM_FILES = new Set([
  "go.mod",
  "go.sum",
  "main.go",
  "Dockerfile",
  "backend/runtime.go",
  "backend/register.go",
]);

export const GO_REQUIRED_FILES = [
  "frontend/App.tsx",
  "backend/operations.go",
  "migrations/001_init.sql (or another versioned <number>_<name>.sql)",
  "acceptance/seed.json",
  "acceptance/scenarios.json",
] as const;

export function assertWorkspaceMutationPath(pathValue: string, runtimeType: WorkspaceRuntimeType) {
  const path = normalizeWorkspacePath(pathValue);
  if (PLATFORM_FILES.has(path)) {
    throw new WorkspaceError(
      "PLATFORM_FILE_NOT_WRITABLE",
      `${path} is provided by the platform and must not be created, modified, or deleted. Write the next required business file instead.`,
    );
  }
  if (!ALLOWED_ROOTS[runtimeType].some((root) => path.startsWith(root))) {
    throw new WorkspaceError(
      "FILE_PATH_NOT_ALLOWED",
      `${path} is outside the ${runtimeType} workspace roots: ${ALLOWED_ROOTS[runtimeType].join(", ")}`,
    );
  }
  return path;
}

export function repeatedObservationError(name: string, revision: number) {
  const emptyHint = name === "list_files" && revision === 0
    ? " The workspace is empty, which is normal for a new application; write the next required file."
    : " Use the result already returned and choose a different action.";
  return {
    ok: false as const,
    error: {
      code: "REPEATED_OBSERVATION",
      message: `${name} was already called with the same arguments at workspace revision ${revision}.${emptyHint}`,
    },
  };
}

export function isObservationTool(name: string) {
  return new Set(["list_files", "search_files", "read_file", "read_file_range", "inspect_diagnostics"]).has(name);
}

export function sameArguments(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return canonical(left) === canonical(right);
}
