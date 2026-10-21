import type { AppBlueprint } from "@/lib/app-contracts";
import prisma from "@/lib/database/prisma";
import { buildWorkspaceFrontend } from "./frontend-build";
import type { CommandResult } from "./command";
import { scrubHostPaths } from "./compiler-diagnostics";
import { compileBackendGo } from "./go-check";
import { typecheckFrontend } from "./typecheck";
import { validateJsonFile, validateWorkspaceFileContract, type WorkspaceDiagnostic } from "./diagnostics";
import { listDraftFiles, readDraftFile } from "./service";
import { validationContextDigest } from "./validation-context";

type WorkspaceFile = { path: string; content: string };
type CheckName = "contract" | "typescript" | "frontend_build" | "go_build";
type Check = { name: CheckName; status: "passed" | "failed" | "skipped"; durationMs?: number; exitCode?: number | null; timedOut?: boolean; outputTruncated?: boolean; output?: string };

export async function validateWorkspaceFiles(files: WorkspaceFile[], runtimeType: "STATIC" | "GO", blueprint?: AppBlueprint) {
  const checks: Check[] = ["contract", "typescript", "frontend_build", "go_build"].map((name) => ({ name: name as CheckName, status: "skipped" }));
  const diagnostics: WorkspaceDiagnostic[] = [];
  const run = async (name: CheckName, action: () => Promise<WorkspaceDiagnostic[] | { diagnostics: WorkspaceDiagnostic[]; command?: CommandResult }> | WorkspaceDiagnostic[]) => {
    const check = checks.find((item) => item.name === name)!;
    const started = Date.now();
    try {
      const result = await action();
      const found = Array.isArray(result) ? result : result.diagnostics;
      const command = Array.isArray(result) ? undefined : result.command;
      diagnostics.push(...found);
      check.status = found.length ? "failed" : "passed";
      if (command) {
        check.exitCode = command.exitCode;
        check.timedOut = command.timedOut;
        check.outputTruncated = command.outputTruncated;
        check.output = scrubHostPaths(command.output.slice(0, 4096));
      }
    } catch (error) {
      check.status = "failed";
      diagnostics.push({ id: `command:${name}:infrastructure`, source: "command", severity: "error", code: "VALIDATOR_FAILED", message: error instanceof Error ? error.message.slice(0, 4096) : String(error).slice(0, 4096) });
    }
    check.durationMs = Date.now() - started;
    return check.status === "passed";
  };

  const contractPassed = await run("contract", () => [
    ...validateWorkspaceFileContract(files, runtimeType, blueprint),
    ...files.filter((file) => file.path.endsWith(".json") && file.path !== "acceptance/scenarios.json").flatMap((file) => validateJsonFile(file.path, file.content)),
  ]);
  if (!contractPassed) return { checks, diagnostics };
  if (!await run("typescript", () => typecheckFrontend(files))) return { checks, diagnostics };
  if (!await run("frontend_build", () => buildWorkspaceFrontend(files))) return { checks, diagnostics };
  if (runtimeType === "GO") await run("go_build", () => compileBackendGo(files));
  return { checks, diagnostics };
}

export async function validateWorkspaceRevision(input: { workspaceId: string; userId: string; revision: number; runtimeType: "STATIC" | "GO"; blueprint?: AppBlueprint }) {
  const listed = await listDraftFiles(input);
  const files = await Promise.all(listed.map(async (file) => readDraftFile({ ...input, path: file.path, revision: input.revision })));
  const result = await validateWorkspaceFiles(files, input.runtimeType, input.blueprint);
  return { workspaceId: input.workspaceId, revision: input.revision, ...result };
}

export async function runWorkspaceCommand(input: { workspaceId: string; userId: string; revision: number; runtimeType: "STATIC" | "GO"; command: "typecheck_frontend" | "build_frontend" | "build_backend" }) {
  const listed = await listDraftFiles(input);
  const files = await Promise.all(listed.map(async (file) => readDraftFile({ workspaceId: input.workspaceId, userId: input.userId, path: file.path, revision: input.revision })));
  if (input.command === "build_backend" && input.runtimeType !== "GO") {
    return { revision: input.revision, command: input.command, diagnostics: [], skipped: true };
  }
  if (input.command === "typecheck_frontend") {
    return { revision: input.revision, command: input.command, diagnostics: await typecheckFrontend(files), skipped: false };
  }
  const result = input.command === "build_frontend" ? await buildWorkspaceFrontend(files) : await compileBackendGo(files);
  return {
    revision: input.revision,
    command: input.command,
    diagnostics: result.diagnostics,
    skipped: false,
    exitCode: result.command.exitCode,
    timedOut: result.command.timedOut,
    outputTruncated: result.command.outputTruncated,
    output: scrubHostPaths(result.command.output.slice(0, 4096)),
  };
}

export async function validateAndRecordWorkspaceRevision(input: { workspaceId: string; userId: string; revision: number; runtimeType: "STATIC" | "GO"; blueprint?: AppBlueprint }) {
  const result = await validateWorkspaceRevision(input);
  const record = await prisma.draftValidationRun.create({
    data: {
      workspaceId: input.workspaceId, revision: input.revision, runtimeType: input.runtimeType,
      contextDigest: validationContextDigest(input.runtimeType, input.blueprint),
      status: result.diagnostics.length ? "FAILED" : "PASSED",
      checks: JSON.parse(JSON.stringify(result.checks)),
      diagnostics: JSON.parse(JSON.stringify(result.diagnostics)),
    },
  });
  return { ...result, validationRunId: record.id, status: record.status };
}

export async function inspectWorkspaceDiagnostics(input: { workspaceId: string; userId: string; revision: number }) {
  // Ownership is checked by the same file service used for validation tools.
  await listDraftFiles(input);
  return prisma.draftValidationRun.findFirst({
    where: { workspaceId: input.workspaceId, revision: input.revision },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
