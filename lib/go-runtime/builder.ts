import { buildPublishedApp } from "@/lib/publishing/builder";
import type { ArtifactFileInput } from "@/lib/projects/artifact-service";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_ROOTS = ["frontend/", "backend/", "migrations/", "acceptance/"];

function safeRelativePath(filePath: string) {
  const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || normalized.startsWith("/") || !ALLOWED_ROOTS.some((root) => normalized.startsWith(root))) {
    throw new Error(`Unsupported generated file path: ${filePath}`);
  }
  return normalized;
}

export async function assembleGoApplication(files: ArtifactFileInput[], outputDirectory: string) {
  const scaffold = path.join(process.cwd(), "runtime", "go-scaffold");
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await cp(scaffold, outputDirectory, { recursive: true });

  const frontendFiles: ArtifactFileInput[] = [];
  for (const file of files) {
    const relative = safeRelativePath(file.path);
    if (relative.startsWith("frontend/")) {
      frontendFiles.push({ path: relative.slice("frontend/".length), content: file.content });
      continue;
    }
    if (relative.startsWith("acceptance/")) continue;
    const target = path.join(outputDirectory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }

  if (!frontendFiles.some((file) => file.path === "App.tsx")) {
    throw new Error("Full-stack artifact is missing frontend/App.tsx");
  }
  if (!files.some((file) => file.path === "backend/operations.go") && !files.some((file) => file.path === "backend/register.go")) {
    throw new Error("Full-stack artifact is missing backend/operations.go");
  }
  if (!files.some((file) => file.path.startsWith("migrations/") && file.path.endsWith(".sql"))) {
    throw new Error("Full-stack artifact is missing SQL migrations");
  }

  const frontendOutput = path.join(outputDirectory, "frontend", "dist");
  await rm(frontendOutput, { recursive: true, force: true });
  await mkdir(frontendOutput, { recursive: true });
  await buildPublishedApp(frontendFiles, frontendOutput);

  const dockerfile = await readFile(path.join(scaffold, "Dockerfile"), "utf8");
  await writeFile(path.join(outputDirectory, "Dockerfile"), dockerfile, "utf8");
}
