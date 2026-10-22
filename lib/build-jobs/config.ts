import path from "node:path";

export function resolveBuildsRoot(
  env: Partial<Record<"APP_BUILDS_ROOT" | "NODE_ENV", string>>,
  cwd: string,
) {
  if (env.APP_BUILDS_ROOT) return path.resolve(env.APP_BUILDS_ROOT);
  return env.NODE_ENV === "production" ? "/app-builds" : path.resolve(cwd, ".app-builds");
}
