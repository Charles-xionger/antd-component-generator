export interface SandboxSourceFile {
  path: string;
  content: string;
}

const NON_FRONTEND_ROOTS = ["backend/", "migrations/", "acceptance/"];

function isSafeRelativePath(value: string) {
  return value.length > 0 && !value.startsWith("/") && !value.split("/").includes("..");
}

export function projectArtifactForSandbox(
  sourceFiles: readonly SandboxSourceFile[],
  runtimeVersion?: string | null,
) {
  const fullstack = runtimeVersion?.startsWith("go-")
    || sourceFiles.some((file) => NON_FRONTEND_ROOTS.some((root) => file.path.startsWith(root)));
  const files: Record<string, string> = {};

  for (const file of sourceFiles) {
    let projectedPath: string | null = null;
    if (file.path.startsWith("frontend/")) projectedPath = file.path.slice("frontend/".length);
    else if (!fullstack && !NON_FRONTEND_ROOTS.some((root) => file.path.startsWith(root))) projectedPath = file.path;
    if (!projectedPath || !isSafeRelativePath(projectedPath)) continue;
    files[projectedPath] = file.content;
  }

  const paths = Object.keys(files);
  const entryFile = paths.find((file) => file === "App.tsx")
    ?? paths.find((file) => file.endsWith("/App.tsx"))
    ?? paths.find((file) => file.endsWith(".tsx") && !file.toLowerCase().includes("use"))
    ?? paths.find((file) => file.endsWith(".tsx"))
    ?? "App.tsx";

  return { files, entryFile };
}
