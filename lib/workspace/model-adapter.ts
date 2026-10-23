import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "@/lib/agent/models";
import type { AgentModel } from "./agent-run";
import { GO_REQUIRED_FILES, type WorkspaceRuntimeType } from "./runtime-contract";

type ToolCall = { name?: unknown; args?: unknown };

const stringField = { type: "string" } as const;
const pathField = { type: "string", description: "Workspace-relative path; never an absolute path." } as const;
const toolDefinitions = [
  ["search_files", "Locate code in the current immutable workspace revision. Supports rg-like path filtering, literal or regex mode, bounded context and result limits.", { query: stringField, pathGlob: stringField, mode: { type: "string", enum: ["literal", "regex"] }, contextLines: { type: "integer" }, maxResults: { type: "integer" } }],
  ["read_file", "Fully read one current-revision file only to prepare an exceptional guarded rewrite. Normal edits must use read_file_range.", { path: pathField }],
  ["read_file_range", "Read a bounded line range of one file.", { path: pathField, startLine: { type: "integer" }, endLine: { type: "integer" } }],
  ["write_file", "Create one new file or initialize one empty file. Cannot replace an existing non-empty file.", { path: pathField, content: stringField }],
  ["write_json_file", "Create or initialize one non-scenario JSON object. Cannot replace an existing non-empty file. The runtime serializes the object; never handwrite its JSON envelope.", { path: pathField, value: { type: "object" } }],
  ["write_scenarios", "Create or initialize acceptance/scenarios.json from an array of scenario objects. Cannot replace an existing non-empty file. The runtime validates the suite and constructs the required {scenarios:[...]} envelope.", { scenarios: { type: "array", items: { type: "object" } } }],
  ["patch_file", "Replace one exact span in one workspace file.", { path: pathField, oldText: stringField, newText: stringField }],
  ["rewrite_file", "Exceptional whole-file replacement after a full current-revision read and either two patch conflicts or an objectively broad change. Requires immediate targeted validation.", { path: pathField, content: stringField, expectedSha256: stringField, reason: stringField }],
  ["delete_file", "Delete exactly one workspace file.", { path: pathField }],
  ["validate_json", "Parse and diagnose one JSON workspace file.", { path: pathField }],
  ["validate_schema", "Validate acceptance/scenarios.json against the scenario suite schema.", {}],
  ["validate_workspace", "Run all required contract, TypeScript, frontend build, and applicable Go checks for the current revision.", {}],
  ["inspect_diagnostics", "Read the most recent validation diagnostics for the current revision.", {}],
  ["run_command", "Run one allowlisted workspace check without shell access: typecheck_frontend, build_frontend, or build_backend.", { command: { type: "string", enum: ["typecheck_frontend", "build_frontend", "build_backend"] } }],
  ["update_plan", "Persist a concise plan with 1-20 steps. Each step has id, title and pending/in_progress/completed status.", { summary: stringField, steps: { type: "array", items: { type: "object", properties: { id: stringField, title: stringField, status: { type: "string", enum: ["pending", "in_progress", "completed"] } }, required: ["id", "title", "status"], additionalProperties: false } } }],
  ["complete", "Finish the coding phase when the workspace is ready for validation.", { summary: stringField }],
  ["ask_question", "Stop when a user decision is essential.", { question: stringField }],
] as const;

const knownNames = new Set<string>(toolDefinitions.map(([name]) => name));

export function workspaceAgentInstructions(runtimeType: WorkspaceRuntimeType) {
  const common = "The currentFiles manifest is provided in every turn and is authoritative; do not call list_files. For an existing file, the normal sequence is search_files → read_file_range → patch_file → run_command targeted validation. A precise current diagnostic may replace search_files, but never the bounded read. write_file is only for a new or empty file. read_file and rewrite_file are an exceptional guarded-rewrite path, never a shortcut for normal edits; a rewrite must be immediately followed by targeted validation. Recent history includes bounded tool-result details, so reuse earlier reads and diagnostics instead of requesting them again. An empty workspace is normal for a new application. Never repeat an unchanged read. Keep one concise plan current, write one precise file per turn, validate the workspace, repair only reported diagnostics, and call complete only after validation is ready.";
  if (runtimeType === "STATIC") {
    return `${common} This is a STATIC workspace. Only frontend/ files are writable and frontend/App.tsx is required.`;
  }
  return `${common} This is a GO workspace, but go.mod, go.sum, main.go, the HTTP server, database connection, health checks, Dockerfile, backend/runtime.go, and backend/register.go are platform-owned and must never be written. Only frontend/, backend/, migrations/, and acceptance/ are writable. Generate these business artifacts: ${GO_REQUIRED_FILES.join(", ")}. frontend/App.tsx must call stable blueprint operation IDs through invoke from @prompt-web/app-runtime. backend/operations.go must expose Operations(*pgxpool.Pool, *slog.Logger) map[string]Operation; business handlers use func(context.Context, json.RawMessage) (any, error). Use only the Go standard library, github.com/jackc/pgx/v5, and internal packages. Migrations are forward-only PostgreSQL SQL. acceptance/seed.json keys match blueprint entity IDs, and acceptance scenarios use blueprint operation IDs. Do not initialize a conventional standalone Go or Vite project.`;
}

export function parseWorkspaceToolDecision(response: { tool_calls?: ToolCall[]; invalid_tool_calls?: unknown[] }) {
  if (response.invalid_tool_calls?.length) throw new Error("MODEL_TOOL_CALL_INVALID");
  if (!response.tool_calls || response.tool_calls.length !== 1) throw new Error("MODEL_MUST_CALL_ONE_TOOL");
  const call = response.tool_calls[0];
  if (typeof call.name !== "string" || !knownNames.has(call.name) || !call.args || typeof call.args !== "object" || Array.isArray(call.args)) {
    throw new Error("MODEL_TOOL_CALL_INVALID");
  }
  if (call.name === "complete") return { kind: "complete" as const, summary: (call.args as Record<string, unknown>).summary };
  if (call.name === "ask_question") return { kind: "question" as const, question: (call.args as Record<string, unknown>).question };
  return { kind: "tool" as const, name: call.name, arguments: call.args };
}

export function createWorkspaceAgentModel(modelName: string, context: { requirementSpec?: unknown; appBlueprint?: unknown }): AgentModel {
  const llm = createLLM(modelName, { model: modelName, temperature: 0.2 });
  if (!llm.bindTools) throw new Error("MODEL_TOOL_CALLS_UNSUPPORTED");
  const bound = llm.bindTools(toolDefinitions.map(([name, description, properties]) => ({
    type: "function" as const,
    function: {
      name,
      description,
      parameters: { type: "object", properties, required: name === "complete" ? ["summary"] : name === "ask_question" ? ["question"] : Object.keys(properties).filter((key) => !["maxResults", "pathGlob", "mode", "contextLines"].includes(key)), additionalProperties: false },
    },
  })));
  return {
    async decide(observation) {
      const previous = JSON.stringify(observation.previousResult ?? null).slice(0, 16_000);
      const response = await bound.invoke([
        new SystemMessage(`You are a workspace coding agent. The database workspace is the only source of code. Call exactly one provided tool each turn. Never output <boltArtifact>, file-change events, or complete project snapshots in text. For JSON files use write_json_file, and for acceptance/scenarios.json use write_scenarios so the runtime constructs its required envelope. Ask a question only if user input is essential. ${workspaceAgentInstructions(observation.runtimeType)}`),
        new HumanMessage(JSON.stringify({ goal: observation.goal, runtimeType: observation.runtimeType, requirementSpec: context.requirementSpec, appBlueprint: context.appBlueprint, workspaceId: observation.workspaceId, revision: observation.revision, currentFiles: observation.files, step: observation.step, plan: observation.plan, history: observation.history, previousResult: previous })),
      ]);
      return parseWorkspaceToolDecision(response);
    },
  };
}
