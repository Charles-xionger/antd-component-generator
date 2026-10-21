export class WorkspacePathError extends Error {
  readonly code = "INVALID_WORKSPACE_PATH";
}

const MAX_PATH_BYTES = 512;

export function normalizeWorkspacePath(value: string): string {
  if (typeof value !== "string" || !value || !value.isWellFormed() || Buffer.byteLength(value, "utf8") > MAX_PATH_BYTES) {
    throw new WorkspacePathError("Invalid workspace path length");
  }
  if (/[%\\\u0000-\u001f\u007f]/.test(value) || value.startsWith("/") || /^[a-z]:/i.test(value)) {
    throw new WorkspacePathError("Workspace path must be relative and unencoded");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) {
    throw new WorkspacePathError("Unsafe workspace path segment");
  }
  return value;
}
