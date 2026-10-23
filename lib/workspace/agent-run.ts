import { randomUUID } from "node:crypto";
import { z } from "zod";
import { acceptanceScenarioSuiteSchema, appBlueprintSchema, requirementSpecSchema } from "@/lib/app-contracts";
import prisma from "@/lib/database/prisma";
import { validateAcceptanceScenarios, validateJsonFile } from "./diagnostics";
import { appendAgentEvent } from "./events";
import { WorkspacePathError } from "./path";
import { deleteDraftFile, listDraftFiles, patchDraftFile, readDraftFile, readDraftFileRange, rewriteDraftFile, searchDraftFiles, WorkspaceError, writeDraftFile } from "./service";
import { inspectWorkspaceDiagnostics, runWorkspaceCommand, validateAndRecordWorkspaceRevision } from "./validation";
import { assertWorkspaceMutationPath, evaluateWorkspacePolicy, isObservationTool, isTargetedValidationForPath, repeatedObservationError, sameArguments, type WorkspacePolicyEvidence, type WorkspaceRuntimeType } from "./runtime-contract";

const toolDecisionSchema = z.object({
  kind: z.literal("tool"),
  name: z.enum(["list_files", "search_files", "read_file", "read_file_range", "write_file", "write_json_file", "write_scenarios", "patch_file", "rewrite_file", "delete_file", "update_plan", "validate_json", "validate_schema", "validate_workspace", "inspect_diagnostics", "run_command"]),
  arguments: z.record(z.string(), z.unknown()),
}).strict();
const decisionSchema = z.discriminatedUnion("kind", [
  toolDecisionSchema,
  z.object({ kind: z.literal("complete"), summary: z.string().min(1).max(4000) }).strict(),
  z.object({ kind: z.literal("question"), question: z.string().min(1).max(4000) }).strict(),
]);
const modelErrorSchema = z.object({ kind: z.literal("model_error"), code: z.enum(["MODEL_TOOL_CALL_INVALID", "MODEL_MUST_CALL_ONE_TOOL", "MODEL_DECISION_INVALID", "MODEL_RESPONSE_INTERRUPTED"]) }).strict();
const persistedDecisionSchema = z.object({ decision: z.union([decisionSchema, modelErrorSchema]), expectedRevision: z.number().int().nonnegative() }).strict();

type Decision = z.infer<typeof decisionSchema>;
type ModelErrorDecision = z.infer<typeof modelErrorSchema>;
const modelErrorMessages: Record<ModelErrorDecision["code"], string> = {
  MODEL_TOOL_CALL_INVALID: "Model returned an incomplete or invalid tool call",
  MODEL_MUST_CALL_ONE_TOOL: "Model must call exactly one tool",
  MODEL_DECISION_INVALID: "Model tool decision failed schema validation",
  MODEL_RESPONSE_INTERRUPTED: "Model response was interrupted; retry the current step",
};
function modelErrorDecision(error: unknown): ModelErrorDecision {
  if (error instanceof Error && (error.message === "MODEL_TOOL_CALL_INVALID" || error.message === "MODEL_MUST_CALL_ONE_TOOL")) return { kind: "model_error", code: error.message };
  return { kind: "model_error", code: error instanceof z.ZodError ? "MODEL_DECISION_INVALID" : "MODEL_RESPONSE_INTERRUPTED" };
}
export type AgentModel = { decide(observation: {
  goal: string;
  workspaceId: string;
  runtimeType: WorkspaceRuntimeType;
  revision: number;
  files: Array<{ path: string; sha256: string; revision: number }>;
  step: number;
  plan: unknown;
  previousResult: unknown;
  history: Array<{ step: number; action: string; path?: string; outcome?: string; details?: string }>;
}): Promise<unknown> };

const locationSchema = z.object({ path: z.string().min(1).max(512) }).strict();
const writeSchema = locationSchema.extend({ content: z.string().max(1024 * 1024) });
const patchSchema = locationSchema.extend({ oldText: z.string().min(1), newText: z.string() });
const rewriteSchema = writeSchema.extend({ expectedSha256: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().min(1).max(1000) });
const searchSchema = z.object({
  query: z.string().min(1).max(512),
  pathGlob: z.string().min(1).max(256).optional(),
  mode: z.enum(["literal", "regex"]).optional(),
  contextLines: z.number().int().min(0).max(8).optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
}).strict();
const rangeSchema = locationSchema.extend({ startLine: z.number().int().min(1), endLine: z.number().int().min(1) });
const commandSchema = z.object({ command: z.enum(["typecheck_frontend", "build_frontend", "build_backend"]) }).strict();
const jsonWriteSchema = locationSchema.extend({ value: z.record(z.string(), z.unknown()) });
const scenarioWriteSchema = z.object({ scenarios: z.array(z.unknown()) }).strict();
const planSchema = z.object({
  summary: z.string().min(1).max(2000),
  steps: z.array(z.object({ id: z.string().min(1).max(80), title: z.string().min(1).max(200), status: z.enum(["pending", "in_progress", "completed"]) }).strict()).min(1).max(20),
}).strict();
const diagnosticFingerprint = (value: unknown) => Array.isArray(value)
  ? value.map((item) => {
      const diagnostic = item as Record<string, unknown>;
      return [diagnostic.code, diagnostic.file, diagnostic.path, diagnostic.line, diagnostic.column, diagnostic.message].map((part) => String(part ?? "")).join(":");
    }).sort().join("|")
  : "";

type CompletedStep = { number: number; decision: unknown; result: unknown };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedHistoryDetails(action: string, result: Record<string, unknown> | null) {
  if (!result) return undefined;
  if (action !== "read_file") return JSON.stringify(result).slice(0, 6000);
  const value = object(result.value);
  return JSON.stringify({
    ...result,
    value: value ? { path: value.path, sha256: value.sha256, revision: value.revision, fullRead: true } : value,
  }).slice(0, 6000);
}

function replacementRatio(before: string, after: string) {
  if (before === after) return 0;
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return Math.max(before.length - prefix - suffix, after.length - prefix - suffix) / Math.max(1, before.length, after.length);
}

export function buildWorkspacePolicyEvidence(steps: CompletedStep[], revision: number): WorkspacePolicyEvidence {
  const locatedPaths = new Set<string>();
  const ranges: WorkspacePolicyEvidence["ranges"] = [];
  const fullReads = new Map<string, string>();
  const patchConflicts = new Map<string, number>();
  let rewriteDebt: WorkspacePolicyEvidence["rewriteDebt"] = null;
  for (const step of steps.sort((a, b) => a.number - b.number)) {
    const saved = persistedDecisionSchema.safeParse(step.decision);
    if (!saved.success) continue;
    const result = object(step.result);
    const validation = object(result?.validation);
    if (saved.data.expectedRevision === revision && Array.isArray(validation?.diagnostics)) {
      for (const diagnostic of validation.diagnostics) {
        const item = object(diagnostic);
        const diagnosticPath = typeof item?.path === "string" ? item.path : typeof item?.file === "string" ? item.file : null;
        if (diagnosticPath && Number.isInteger(item?.line)) locatedPaths.add(diagnosticPath);
      }
    }
    if (saved.data.decision.kind !== "tool") continue;
    const decision = saved.data.decision;
    const value = object(result?.value);
    const error = object(result?.error);
    const expectedRevision = saved.data.expectedRevision;
    const path = typeof decision.arguments.path === "string" ? decision.arguments.path : "";
    if (decision.name === "rewrite_file" && result?.ok === true && typeof value?.revision === "number") {
      rewriteDebt = { path, revision: value.revision, auditItemId: typeof value.auditItemId === "string" ? value.auditItemId : `${step.number}` };
    }
    if (rewriteDebt && expectedRevision === rewriteDebt.revision && result?.ok === true && isTargetedValidationForPath(rewriteDebt.path, decision.name, decision.arguments.command)) {
      const diagnostics = Array.isArray(value?.diagnostics) ? value.diagnostics : [];
      const statusPassed = decision.name === "validate_workspace" ? value?.status === "PASSED" : diagnostics.length === 0;
      if (statusPassed) rewriteDebt = null;
    }
    if (expectedRevision !== revision) continue;
    if (decision.name === "patch_file" && error?.code === "PATCH_CONFLICT" && path) patchConflicts.set(path, (patchConflicts.get(path) ?? 0) + 1);
    if (result?.ok !== true) continue;
    if (decision.name === "search_files" && Array.isArray(value?.hits)) {
      for (const hit of value.hits) {
        const item = object(hit);
        if (typeof item?.path === "string") locatedPaths.add(item.path);
      }
    }
    if (decision.name === "inspect_diagnostics") {
      const diagnostics = Array.isArray(value?.diagnostics) ? value.diagnostics : [];
      for (const diagnostic of diagnostics) {
        const item = object(diagnostic);
        const diagnosticPath = typeof item?.path === "string" ? item.path : typeof item?.file === "string" ? item.file : null;
        if (diagnosticPath && Number.isInteger(item?.line)) locatedPaths.add(diagnosticPath);
      }
    }
    if (decision.name === "read_file_range" && path && typeof value?.content === "string" && typeof value.startLine === "number" && typeof value.endLine === "number") {
      ranges.push({ path, startLine: value.startLine, endLine: value.endLine, content: value.content });
    }
    if (decision.name === "read_file" && path && typeof value?.sha256 === "string") fullReads.set(path, value.sha256);
  }
  const fingerprint = JSON.stringify({
    revision,
    located: [...locatedPaths].sort(),
    ranges: ranges.map(({ path, startLine, endLine }) => [path, startLine, endLine]),
    fullReads: [...fullReads].sort(),
    patchConflicts: [...patchConflicts].sort(),
    rewriteDebt,
  });
  return { revision, locatedPaths, ranges, fullReads, patchConflicts, rewriteDebt, fingerprint };
}

async function ownedRun(runId: string, userId: string) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, workspace: { project: { userId, status: "ACTIVE" } } }, include: { workspace: { include: { baseArtifactVersion: true } } } });
  if (!run) throw new WorkspaceError("NOT_FOUND", "Agent run not found");
  return run;
}

async function updateAgentPlan(input: { runId: string; workspaceId: string; leaseToken: string; expectedRevision: number; toolCallId: string; value: unknown }) {
  const plan = planSchema.parse(input.value);
  await prisma.$transaction(async (tx) => {
    const workspace = await tx.draftWorkspace.findFirst({ where: { id: input.workspaceId, revision: input.expectedRevision, status: "ACTIVE" }, select: { id: true } });
    if (!workspace) throw new WorkspaceError("REVISION_CONFLICT", "Workspace revision changed before plan update");
    const updated = await tx.agentRun.updateMany({
      where: { id: input.runId, workspaceId: input.workspaceId, status: "RUNNING", leaseToken: input.leaseToken, leaseUntil: { gt: new Date() } },
      data: { plan: JSON.parse(JSON.stringify(plan)) },
    });
    if (updated.count !== 1) throw new WorkspaceError("RUN_LEASE_LOST", "Agent lease was lost before plan update");
    await appendAgentEvent(tx, { runId: input.runId, type: "plan.updated", itemId: input.toolCallId, toolCallId: input.toolCallId, payload: { ...plan, revision: input.expectedRevision } });
  });
  return { plan, revision: input.expectedRevision };
}

export async function createAgentRun(input: { workspaceId: string; userId: string; requestId: string; goal: string; runtimeType: "STATIC" | "GO"; modelName?: string; requirementSpec?: unknown; appBlueprint?: unknown; maxSteps?: number; timeoutMs?: number }) {
  if (!input.requestId || input.requestId.length > 128 || !input.goal || input.goal.length > 16_000) throw new WorkspaceError("INVALID_REQUEST", "Invalid agent run request");
  if (input.modelName !== undefined && (!/^[a-zA-Z0-9_.-]{2,100}$/.test(input.modelName))) throw new WorkspaceError("INVALID_MODEL", "Invalid model name");
  const maxSteps = input.maxSteps ?? 30;
  const timeoutMs = input.timeoutMs ?? 30 * 60_000;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60 * 60_000) throw new WorkspaceError("INVALID_REQUEST", "Invalid run limits");
  const workspace = await prisma.draftWorkspace.findFirst({ where: { id: input.workspaceId, status: "ACTIVE", project: { userId: input.userId, status: "ACTIVE" } }, include: { project: { include: { thread: true } } } });
  if (!workspace) throw new WorkspaceError("NOT_FOUND", "Workspace not found");
  const requirementSpec = input.requirementSpec === undefined ? undefined : requirementSpecSchema.parse(input.requirementSpec);
  const appBlueprint = input.appBlueprint === undefined ? undefined : appBlueprintSchema.parse(input.appBlueprint);
  if (appBlueprint && appBlueprint.runtimeType !== input.runtimeType) throw new WorkspaceError("RUNTIME_CONFLICT", "Blueprint runtime does not match run runtime");
  const existing = await prisma.agentRun.findUnique({ where: { requestId: input.requestId } });
  if (existing) {
    if (existing.workspaceId !== workspace.id || existing.goal !== input.goal || existing.runtimeType !== input.runtimeType || existing.modelName !== (input.modelName ?? "qwen3.7-flash-2026-07-15")) throw new WorkspaceError("REQUEST_CONFLICT", "Request ID already used");
    return existing;
  }
  try {
    return await prisma.agentRun.create({ data: { workspaceId: workspace.id, requestId: input.requestId, sessionId: workspace.project.thread?.id ?? workspace.projectId, turnId: randomUUID(), nextEventSeq: 2, goal: input.goal, modelName: input.modelName, runtimeType: input.runtimeType, requirementSpec: requirementSpec ? JSON.parse(JSON.stringify(requirementSpec)) : undefined, appBlueprint: appBlueprint ? JSON.parse(JSON.stringify(appBlueprint)) : undefined, maxSteps, deadlineAt: new Date(Date.now() + timeoutMs), events: { create: { sequence: 1, type: "plan.updated", itemId: randomUUID(), payload: { goal: input.goal, phase: "queued" } } } } });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const raced = await prisma.agentRun.findUnique({ where: { requestId: input.requestId } });
      if (raced?.workspaceId === workspace.id && raced.goal === input.goal && raced.runtimeType === input.runtimeType && raced.modelName === (input.modelName ?? "qwen3.7-flash-2026-07-15")) return raced;
      if (raced) throw new WorkspaceError("REQUEST_CONFLICT", "Request ID already used");
      throw new WorkspaceError("WORKSPACE_BUSY", "当前项目已有进行中的工作区任务，请等待完成或取消后再试");
    }
    throw error;
  }
}

async function executeTool(decision: Extract<Decision, { kind: "tool" }>, context: { workspaceId: string; userId: string; expectedRevision: number; toolCallId: string; runId: string; leaseToken: string; runtimeType: "STATIC" | "GO"; appBlueprint?: unknown; policyEvidence: WorkspacePolicyEvidence }) {
  const scope = { workspaceId: context.workspaceId, userId: context.userId };
  const mutation = { ...scope, toolCallId: context.toolCallId, expectedRevision: context.expectedRevision, agentLease: { runId: context.runId, leaseToken: context.leaseToken } };
  const rawPath = decision.name === "write_scenarios" ? "acceptance/scenarios.json" : typeof decision.arguments.path === "string" ? decision.arguments.path : undefined;
  const mutationNames = new Set(["write_file", "write_json_file", "write_scenarios", "patch_file", "rewrite_file", "delete_file"]);
  const argumentPath = rawPath && mutationNames.has(decision.name) ? assertWorkspaceMutationPath(rawPath, context.runtimeType) : rawPath;
  let currentFile: Awaited<ReturnType<typeof readDraftFile>> | null = null;
  if (argumentPath && mutationNames.has(decision.name)) {
    try { currentFile = await readDraftFile({ ...scope, path: argumentPath, revision: context.expectedRevision }); }
    catch (error) { if (!(error instanceof WorkspaceError) || error.code !== "FILE_NOT_FOUND") throw error; }
  }
  const policy = evaluateWorkspacePolicy({
    action: decision.name,
    path: argumentPath,
    oldText: typeof decision.arguments.oldText === "string" ? decision.arguments.oldText : undefined,
    fileExists: currentFile !== null,
    fileIsEmpty: currentFile?.content.length === 0,
    expectedSha256: typeof decision.arguments.expectedSha256 === "string" ? decision.arguments.expectedSha256 : undefined,
    reason: typeof decision.arguments.reason === "string" ? decision.arguments.reason : undefined,
    replacementRatio: currentFile && typeof decision.arguments.content === "string" ? replacementRatio(currentFile.content, decision.arguments.content) : undefined,
  }, context.policyEvidence);
  if (policy) throw new WorkspaceError(policy.code, policy.message, { requiredEvidence: policy.requiredEvidence, allowedNextActions: policy.allowedNextActions });
  switch (decision.name) {
    case "list_files": return listDraftFiles(scope);
    case "search_files": return searchDraftFiles({ ...scope, ...searchSchema.parse(decision.arguments) });
    case "read_file": {
      const file = await readDraftFile({ ...scope, ...locationSchema.parse(decision.arguments), revision: context.expectedRevision });
      if (Buffer.byteLength(file.content, "utf8") > 128 * 1024) throw new WorkspaceError("FILE_TOO_LARGE", "Full reads are limited to 128 KiB; use read_file_range");
      return file;
    }
    case "read_file_range": return readDraftFileRange({ ...scope, ...rangeSchema.parse(decision.arguments) });
    case "write_file": {
      const value = writeSchema.parse(decision.arguments);
      return writeDraftFile({ ...mutation, ...value, path: assertWorkspaceMutationPath(value.path, context.runtimeType) });
    }
    case "write_json_file": {
      const { path, value } = jsonWriteSchema.parse(decision.arguments);
      if (!path.endsWith(".json") || path === "acceptance/scenarios.json") throw new WorkspaceError("INVALID_JSON_TARGET", "Use write_scenarios for acceptance/scenarios.json; other JSON targets must end in .json");
      return writeDraftFile({ ...mutation, path: assertWorkspaceMutationPath(path, context.runtimeType), content: `${JSON.stringify(value, null, 2)}\n` });
    }
    case "write_scenarios": {
      const { scenarios } = scenarioWriteSchema.parse(decision.arguments);
      const suite = acceptanceScenarioSuiteSchema.parse({ scenarios });
      return writeDraftFile({ ...mutation, path: assertWorkspaceMutationPath("acceptance/scenarios.json", context.runtimeType), content: `${JSON.stringify(suite, null, 2)}\n` });
    }
    case "patch_file": {
      const value = patchSchema.parse(decision.arguments);
      return patchDraftFile({ ...mutation, ...value, path: assertWorkspaceMutationPath(value.path, context.runtimeType) });
    }
    case "rewrite_file": {
      const value = rewriteSchema.parse(decision.arguments);
      const path = assertWorkspaceMutationPath(value.path, context.runtimeType);
      const conflicts = context.policyEvidence.patchConflicts.get(path) ?? 0;
      return rewriteDraftFile({ ...mutation, ...value, path, exception: conflicts >= 2 ? "patch_conflicts" : "broad_replacement" });
    }
    case "delete_file": {
      const value = locationSchema.parse(decision.arguments);
      return deleteDraftFile({ ...mutation, ...value, path: assertWorkspaceMutationPath(value.path, context.runtimeType) });
    }
    case "validate_json": {
      const file = await readDraftFile({ ...scope, ...locationSchema.parse(decision.arguments), revision: context.expectedRevision });
      return { revision: context.expectedRevision, diagnostics: validateJsonFile(file.path, file.content) };
    }
    case "validate_schema": {
      const file = await readDraftFile({ ...scope, path: "acceptance/scenarios.json", revision: context.expectedRevision });
      return { revision: context.expectedRevision, diagnostics: validateAcceptanceScenarios(file.content) };
    }
    case "validate_workspace": return validateAndRecordWorkspaceRevision({ ...scope, revision: context.expectedRevision, runtimeType: context.runtimeType, blueprint: context.appBlueprint as never });
    case "inspect_diagnostics": return inspectWorkspaceDiagnostics({ ...scope, revision: context.expectedRevision });
    case "run_command": return runWorkspaceCommand({ ...scope, revision: context.expectedRevision, runtimeType: context.runtimeType, ...commandSchema.parse(decision.arguments) });
    case "update_plan": return updateAgentPlan({ runId: context.runId, workspaceId: context.workspaceId, leaseToken: context.leaseToken, expectedRevision: context.expectedRevision, toolCallId: context.toolCallId, value: decision.arguments });
  }
}

async function recordFailure(runId: string, leaseToken: string, error: unknown) {
  const summary = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
  await prisma.$transaction(async (tx) => {
    const failed = await tx.agentRun.updateMany({ where: { id: runId, leaseToken, status: "RUNNING" }, data: { status: "FAILED", summary, leaseToken: null, leaseUntil: null } });
    if (failed.count) await appendAgentEvent(tx, { runId, type: "run.failed", itemId: runId, payload: { message: summary } });
  });
}

export async function executeAgentRun(input: { runId: string; userId: string; model: AgentModel }) {
  const initial = await ownedRun(input.runId, input.userId);
  if (initial.status !== "QUEUED" && initial.status !== "RUNNING") return initial;
  const leaseToken = randomUUID();
  const now = new Date();
  const claimed = await prisma.agentRun.updateMany({
    where: { id: initial.id, status: { in: ["QUEUED", "RUNNING"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { status: "RUNNING", leaseToken, leaseUntil: new Date(now.getTime() + 120_000) },
  });
  if (claimed.count !== 1) throw new WorkspaceError("RUN_BUSY", "Agent run is already being executed");
  await prisma.$transaction((tx) => appendAgentEvent(tx, { runId: initial.id, type: "run.started", itemId: initial.id, payload: { workspaceId: initial.workspaceId } }));
  let leaseLost = false;
  const renew = async () => {
    const renewed = await prisma.agentRun.updateMany({ where: { id: initial.id, leaseToken, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + 120_000) } });
    if (renewed.count !== 1) leaseLost = true;
  };
  const heartbeat = setInterval(() => { void renew().catch(() => { leaseLost = true; }); }, 30_000);
  heartbeat.unref();
  try {
    while (true) {
      const run = await ownedRun(input.runId, input.userId);
      if (run.status !== "RUNNING" || run.leaseToken !== leaseToken || leaseLost) return run;
      if (run.deadlineAt <= new Date() || run.nextStep >= run.maxSteps) {
        await prisma.$transaction(async (tx) => {
          const failed = await tx.agentRun.updateMany({ where: { id: run.id, leaseToken, status: "RUNNING" }, data: { status: "FAILED", summary: "Agent run reached its time or step limit", leaseToken: null, leaseUntil: null } });
          if (failed.count) await appendAgentEvent(tx, { runId: run.id, type: "run.failed", itemId: run.id, payload: { message: "Agent run reached its time or step limit" } });
        });
        return ownedRun(run.id, input.userId);
      }
      const prior = await prisma.agentRunStep.findFirst({ where: { runId: run.id, status: "COMPLETED" }, orderBy: { number: "desc" } });
      let step = await prisma.agentRunStep.findUnique({ where: { runId_number: { runId: run.id, number: run.nextStep } } });
      if (!step) {
        const recent = await prisma.agentRunStep.findMany({ where: { runId: run.id, status: "COMPLETED" }, orderBy: { number: "desc" }, take: 12 });
        const history = recent.reverse().map((entry) => {
          const saved = persistedDecisionSchema.safeParse(entry.decision);
          const choice = saved.success ? saved.data.decision : null;
          const result = entry.result && typeof entry.result === "object" ? entry.result as Record<string, unknown> : null;
          const error = result?.error && typeof result.error === "object" ? result.error as Record<string, unknown> : null;
          const validation = result?.validation && typeof result.validation === "object" ? result.validation as Record<string, unknown> : null;
          const args = choice?.kind === "tool" ? choice.arguments : null;
          return {
            step: entry.number,
            action: choice?.kind === "tool" ? choice.name : choice?.kind ?? "unknown",
            path: typeof args?.path === "string" ? args.path : undefined,
            outcome: typeof error?.code === "string" ? error.code : typeof validation?.status === "string" ? validation.status : result?.ok === true ? "ok" : undefined,
            details: boundedHistoryDetails(choice?.kind === "tool" ? choice.name : "", result),
          };
        });
        let decision: Decision | ModelErrorDecision;
        try {
          const files = await listDraftFiles({ workspaceId: run.workspaceId, userId: input.userId, revision: run.workspace.revision });
          const response = await input.model.decide({ goal: run.goal, workspaceId: run.workspaceId, runtimeType: run.runtimeType, revision: run.workspace.revision, files, step: run.nextStep, plan: run.plan, previousResult: prior?.result, history });
          decision = decisionSchema.parse(response);
        } catch (error) {
          // An incomplete model response is one failed step, not a failed
          // workspace. Earlier successful file writes remain available.
          decision = modelErrorDecision(error);
        }
        await renew();
        if (leaseLost) throw new WorkspaceError("RUN_LEASE_LOST", "Agent run lease was lost");
        step = await prisma.agentRunStep.create({ data: { runId: run.id, number: run.nextStep, decision: JSON.parse(JSON.stringify({ decision, expectedRevision: run.workspace.revision })) } });
      }
      const { decision, expectedRevision } = persistedDecisionSchema.parse(step.decision);
      const completedPolicySteps = await prisma.agentRunStep.findMany({
        where: { runId: run.id, status: "COMPLETED" },
        orderBy: { number: "asc" },
        select: { number: true, decision: true, result: true },
      });
      const policyEvidence = buildWorkspacePolicyEvidence(completedPolicySteps, expectedRevision);
      await renew();
      if (leaseLost) throw new WorkspaceError("RUN_LEASE_LOST", "Agent run lease was lost");
      const itemId = `${run.id}:${run.nextStep}`;
      if (decision.kind === "tool") {
        await prisma.$transaction((tx) => appendAgentEvent(tx, { runId: run.id, type: "tool.started", itemId, toolCallId: itemId, payload: { name: decision.name, path: typeof decision.arguments.path === "string" ? decision.arguments.path : null, revision: expectedRevision } }));
      }
      if (decision.kind === "complete" && policyEvidence.rewriteDebt) {
        const policy = evaluateWorkspacePolicy({ action: "complete" }, policyEvidence)!;
        const result = { ok: false, error: { ...policy, evidenceFingerprint: policyEvidence.fingerprint } };
        const previous = prior?.result && typeof prior.result === "object" ? prior.result as { ok?: unknown; error?: { code?: string; message?: string; evidenceFingerprint?: string } } : null;
        const noProgress = previous?.ok === false && previous.error?.code === policy.code && previous.error?.message === policy.message && previous.error.evidenceFingerprint === policyEvidence.fingerprint;
        await prisma.$transaction(async (tx) => {
          const updated = await tx.agentRun.updateMany({
            where: { id: run.id, status: "RUNNING", leaseToken, leaseUntil: { gt: new Date() } },
            data: { nextStep: { increment: 1 }, ...(noProgress ? { status: "NO_PROGRESS", summary: "Same workspace policy violation repeated without new evidence", leaseToken: null, leaseUntil: null } : { leaseUntil: new Date(Date.now() + 120_000) }) },
          });
          if (updated.count !== 1) throw new WorkspaceError("RUN_LEASE_LOST", "Agent run lease was lost before completing a step");
          await tx.agentRunStep.update({ where: { runId_number: { runId: run.id, number: run.nextStep } }, data: { status: "COMPLETED", result, completedAt: new Date() } });
          await appendAgentEvent(tx, { runId: run.id, type: "policy.rejected", itemId, payload: { revision: expectedRevision, error: policy } });
          if (noProgress) await appendAgentEvent(tx, { runId: run.id, type: "run.stopped", itemId: run.id, payload: { reason: "no_progress", revision: expectedRevision } });
        });
        if (noProgress) return ownedRun(run.id, input.userId);
        continue;
      }
      if (decision.kind === "complete" || decision.kind === "question") {
        const validation = decision.kind === "complete" ? await validateAndRecordWorkspaceRevision({ workspaceId: run.workspaceId, userId: input.userId, revision: expectedRevision, runtimeType: run.runtimeType, blueprint: (run.appBlueprint ?? run.workspace.baseArtifactVersion?.appBlueprint ?? undefined) as never }) : null;
        const previousValidation = prior?.result && typeof prior.result === "object" ? (prior.result as { validation?: { revision?: number; diagnostics?: unknown } }).validation : undefined;
        const noProgress = validation?.status === "FAILED" && previousValidation?.revision === expectedRevision && diagnosticFingerprint(previousValidation.diagnostics) === diagnosticFingerprint(validation.diagnostics);
        const status = decision.kind === "question" ? "NEEDS_INPUT" : validation?.status === "PASSED" ? "READY_TO_VALIDATE" : noProgress ? "NO_PROGRESS" : "RUNNING";
        const currentPlan = status === "READY_TO_VALIDATE" ? planSchema.safeParse(run.plan) : null;
        const completedPlan = currentPlan?.success ? { ...currentPlan.data, steps: currentPlan.data.steps.map((planStep) => ({ ...planStep, status: "completed" as const })) } : null;
        const result = decision.kind === "question" ? { question: decision.question } : { validation: { revision: validation!.revision, validationRunId: validation!.validationRunId, status: validation!.status, diagnostics: validation!.diagnostics } };
        await prisma.$transaction(async (tx) => {
          const updated = await tx.agentRun.updateMany({ where: { id: run.id, status: "RUNNING", leaseToken, leaseUntil: { gt: new Date() } }, data: { status, nextStep: { increment: 1 }, summary: status === "NO_PROGRESS" ? "Same validation diagnostics repeated without a workspace change" : decision.kind === "complete" ? decision.summary : decision.question, ...(completedPlan ? { plan: JSON.parse(JSON.stringify(completedPlan)) } : {}), ...(status === "RUNNING" ? { leaseUntil: new Date(Date.now() + 120_000) } : { leaseToken: null, leaseUntil: null }) } });
          if (updated.count !== 1) throw new WorkspaceError("RUN_LEASE_LOST", "Agent run lease was lost before completing a step");
          await tx.agentRunStep.update({ where: { runId_number: { runId: run.id, number: run.nextStep } }, data: { status: "COMPLETED", result, completedAt: new Date() } });
          if (validation) {
            await appendAgentEvent(tx, { runId: run.id, type: "validation.completed", itemId, payload: { revision: expectedRevision, validationRunId: validation.validationRunId, status: validation.status, diagnosticCount: validation.diagnostics.length } });
            for (const diagnostic of validation.diagnostics) await appendAgentEvent(tx, { runId: run.id, type: "diagnostic.created", itemId: `${validation.validationRunId}:${diagnostic.id}`, payload: { revision: expectedRevision, diagnostic } });
            for (const check of validation.checks) if (check.output) await appendAgentEvent(tx, { runId: run.id, type: "command.output", itemId: `${validation.validationRunId}:${check.name}`, payload: { revision: expectedRevision, check: check.name, output: check.output } });
            if (completedPlan) await appendAgentEvent(tx, { runId: run.id, type: "plan.updated", itemId: `${itemId}:completed`, payload: { ...completedPlan, revision: expectedRevision } });
          } else {
            await appendAgentEvent(tx, { runId: run.id, type: "question.asked", itemId, payload: { question: decision.kind === "question" ? decision.question : "" } });
          }
          if (status === "NO_PROGRESS") await appendAgentEvent(tx, { runId: run.id, type: "run.stopped", itemId: run.id, payload: { reason: "no_progress", revision: expectedRevision } });
        });
        if (status !== "RUNNING") return ownedRun(run.id, input.userId);
        continue;
      }
      let result: { ok: boolean; value?: unknown; error?: { code: string; message: string; requiredEvidence?: string[]; allowedNextActions?: string[]; evidenceFingerprint?: string } };
      let repeatedObservationLimit = false;
      if (decision.kind === "model_error") {
        result = { ok: false, error: { code: decision.code, message: modelErrorMessages[decision.code] } };
      } else {
        let repeatedObservationCount = 0;
        if (isObservationTool(decision.name)) {
          const recentDecisions = await prisma.agentRunStep.findMany({
            where: { runId: run.id, status: "COMPLETED", number: { lt: run.nextStep } },
            orderBy: { number: "desc" },
            take: 12,
            select: { decision: true },
          });
          repeatedObservationCount = recentDecisions.filter((entry) => {
            const saved = persistedDecisionSchema.safeParse(entry.decision);
            return saved.success
              && saved.data.expectedRevision === expectedRevision
              && saved.data.decision.kind === "tool"
              && saved.data.decision.name === decision.name
              && sameArguments(saved.data.decision.arguments, decision.arguments);
          }).length;
        }
        const repeatedObservation = repeatedObservationCount > 0;
        repeatedObservationLimit = repeatedObservationCount > 1;
        if (repeatedObservation) {
          result = repeatedObservationError(decision.name, expectedRevision);
        } else {
          try {
            result = { ok: true, value: await executeTool(decision, { workspaceId: run.workspaceId, userId: input.userId, expectedRevision, toolCallId: `${run.id}:${run.nextStep}`, runId: run.id, leaseToken, runtimeType: run.runtimeType, appBlueprint: run.appBlueprint ?? run.workspace.baseArtifactVersion?.appBlueprint ?? undefined, policyEvidence }) };
          } catch (error) {
            if (!(error instanceof WorkspaceError) && !(error instanceof WorkspacePathError) && !(error instanceof z.ZodError)) throw error;
            const code = error instanceof WorkspaceError || error instanceof WorkspacePathError ? error.code : "INVALID_TOOL_ARGUMENTS";
            result = { ok: false, error: {
              code,
              message: error.message.slice(0, 1000),
              ...(error instanceof WorkspaceError && error.details ? error.details : {}),
              ...(new Set(["OBSERVATION_REQUIRED", "PATCH_REQUIRED", "VALIDATION_REQUIRED"]).has(code) ? { evidenceFingerprint: policyEvidence.fingerprint } : {}),
            } };
          }
        }
      }
      const previous = prior?.result && typeof prior.result === "object" ? prior.result as { ok?: unknown; error?: { code?: string; message?: string; evidenceFingerprint?: string }; revision?: number } : null;
      const policyFingerprintMatches = !result.error?.evidenceFingerprint || previous?.error?.evidenceFingerprint === result.error.evidenceFingerprint;
      const noProgress = repeatedObservationLimit || (!result.ok && previous?.ok === false && previous.error?.code === result.error?.code && previous.error?.message === result.error?.message && policyFingerprintMatches && expectedRevision === run.workspace.revision);
      await prisma.$transaction(async (tx) => {
        const updated = await tx.agentRun.updateMany({ where: { id: run.id, status: "RUNNING", leaseToken, leaseUntil: { gt: new Date() } }, data: { nextStep: { increment: 1 }, ...(noProgress ? { status: "NO_PROGRESS", summary: repeatedObservationLimit ? "Same read operation repeated without a workspace change" : "Same tool error repeated without a workspace change", leaseToken: null, leaseUntil: null } : { leaseUntil: new Date(Date.now() + 120_000) }) } });
        if (updated.count !== 1) throw new WorkspaceError("RUN_LEASE_LOST", "Agent run lease was lost before completing a step");
        await tx.agentRunStep.update({ where: { runId_number: { runId: run.id, number: run.nextStep } }, data: { status: "COMPLETED", result: JSON.parse(JSON.stringify(result)), completedAt: new Date() } });
        await appendAgentEvent(tx, decision.kind === "model_error"
          ? { runId: run.id, type: "model.response_rejected", itemId, payload: { revision: expectedRevision, error: result.error } }
          : { runId: run.id, type: "tool.completed", itemId, toolCallId: itemId, payload: { name: decision.name, revision: expectedRevision, ok: result.ok, error: result.error ?? null } });
        if (decision.kind === "tool" && result.ok && (decision.name === "run_command" || decision.name === "validate_workspace") && result.value && typeof result.value === "object") {
          const check = result.value as { command?: string; output?: string; diagnostics?: Array<{ id?: string }> ; status?: string };
          if (check.output) await appendAgentEvent(tx, { runId: run.id, type: "command.output", itemId, payload: { revision: expectedRevision, check: check.command ?? decision.name, output: check.output } });
          if (check.status) await appendAgentEvent(tx, { runId: run.id, type: "validation.completed", itemId, payload: { revision: expectedRevision, status: check.status, diagnosticCount: check.diagnostics?.length ?? 0 } });
          for (const diagnostic of check.diagnostics ?? []) await appendAgentEvent(tx, { runId: run.id, type: "diagnostic.created", itemId: `${itemId}:${diagnostic.id ?? randomUUID()}`, payload: { revision: expectedRevision, diagnostic } });
          const targetedPassed = isTargetedValidationForPath(policyEvidence.rewriteDebt?.path ?? "", decision.name, decision.arguments.command)
            && (decision.name === "validate_workspace" ? check.status === "PASSED" : (check.diagnostics?.length ?? 0) === 0);
          if (policyEvidence.rewriteDebt && policyEvidence.rewriteDebt.revision === expectedRevision && targetedPassed) {
            await appendAgentEvent(tx, { runId: run.id, type: "file.rewrite.validated", itemId: policyEvidence.rewriteDebt.auditItemId, payload: { path: policyEvidence.rewriteDebt.path, revision: expectedRevision, validationStatus: "passed", command: check.command ?? decision.name } });
          }
        }
        if (noProgress) await appendAgentEvent(tx, { runId: run.id, type: "run.stopped", itemId: run.id, payload: { reason: "no_progress", revision: expectedRevision } });
      });
      if (noProgress) return ownedRun(run.id, input.userId);
    }
  } catch (error) {
    await recordFailure(initial.id, leaseToken, error);
    return ownedRun(initial.id, input.userId);
  } finally {
    clearInterval(heartbeat);
  }
}

export const resumeAgentRun = executeAgentRun;

export async function cancelAgentRun(input: { runId: string; userId: string }) {
  const run = await ownedRun(input.runId, input.userId);
  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.agentRun.updateMany({ where: { id: run.id, status: { in: ["QUEUED", "RUNNING", "READY_TO_VALIDATE"] } }, data: { status: "CANCELLED", summary: "用户已取消，草稿已保留", leaseToken: null, leaseUntil: null } });
    if (cancelled.count) await appendAgentEvent(tx, { runId: run.id, type: "run.cancelled", itemId: run.id, payload: { workspaceId: run.workspaceId } });
  });
  return ownedRun(run.id, input.userId);
}
