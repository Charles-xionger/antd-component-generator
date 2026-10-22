import { WorkspaceError } from "./errors";
import { normalizeWorkspacePath } from "./path";

export type WorkspaceRuntimeType = "STATIC" | "GO";

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
