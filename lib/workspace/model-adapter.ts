import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "@/lib/agent/models";
import type { AgentModel } from "./agent-run";

type ToolCall = { name?: unknown; args?: unknown };

const stringField = { type: "string" } as const;
const pathField = { type: "string", description: "Workspace-relative path; never an absolute path." } as const;
const toolDefinitions = [
  ["list_files", "List current workspace files and revisions.", {}],
  ["search_files", "Search current workspace file text.", { query: stringField, maxResults: { type: "integer" } }],
  ["read_file", "Read one workspace file.", { path: pathField }],
  ["read_file_range", "Read a bounded line range of one file.", { path: pathField, startLine: { type: "integer" }, endLine: { type: "integer" } }],
  ["write_file", "Write exactly one workspace file.", { path: pathField, content: stringField }],
  ["patch_file", "Replace one exact span in one workspace file.", { path: pathField, oldText: stringField, newText: stringField }],
  ["delete_file", "Delete exactly one workspace file.", { path: pathField }],
  ["validate_json", "Parse and diagnose one JSON workspace file.", { path: pathField }],
  ["validate_schema", "Validate acceptance/scenarios.json against the scenario suite schema.", {}],
  ["validate_workspace", "Run all required contract, TypeScript, frontend build, and applicable Go checks for the current revision.", {}],
  ["inspect_diagnostics", "Read the most recent validation diagnostics for the current revision.", {}],
  ["run_command", "Run one allowlisted workspace check without shell access: typecheck_frontend, build_frontend, or build_backend.", { command: { type: "string", enum: ["typecheck_frontend", "build_frontend", "build_backend"] } }],
  ["complete", "Finish the coding phase when the workspace is ready for validation.", { summary: stringField }],
  ["ask_question", "Stop when a user decision is essential.", { question: stringField }],
] as const;

const knownNames = new Set<string>(toolDefinitions.map(([name]) => name));

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
      parameters: { type: "object", properties, required: name === "complete" ? ["summary"] : name === "ask_question" ? ["question"] : Object.keys(properties).filter((key) => key !== "maxResults"), additionalProperties: false },
    },
  })));
  return {
    async decide(observation) {
      const previous = JSON.stringify(observation.previousResult ?? null).slice(0, 16_000);
      const response = await bound.invoke([
        new SystemMessage("You are a workspace coding agent. The database workspace is the only source of code. Call exactly one provided tool each turn. Never output <boltArtifact>, file-change events, or complete project snapshots in text. Read relevant files before editing. Use precise file writes or patches, inspect tool results, and call complete only when the coding phase is ready for validation. Ask a question only if user input is essential."),
        new HumanMessage(JSON.stringify({ goal: observation.goal, requirementSpec: context.requirementSpec, appBlueprint: context.appBlueprint, workspaceId: observation.workspaceId, revision: observation.revision, step: observation.step, history: observation.history, previousResult: previous })),
      ]);
      return parseWorkspaceToolDecision(response);
    },
  };
}
