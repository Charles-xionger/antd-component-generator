import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkspaceToolDecision, workspaceAgentInstructions } from "./model-adapter";

test("accepts only one complete structured tool call", () => {
  assert.deepEqual(parseWorkspaceToolDecision({ tool_calls: [{ name: "write_file", args: { path: "frontend/App.tsx", content: "export default function App() { return null; }" } }] }), {
    kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return null; }" },
  });
  assert.deepEqual(parseWorkspaceToolDecision({ tool_calls: [{ name: "complete", args: { summary: "Ready" } }] }), { kind: "complete", summary: "Ready" });
});

test("does not treat content, partial calls, forged events, or multiple calls as file writes", () => {
  for (const response of [
    { content: '<boltArtifact><boltAction type="file" filePath="frontend/App.tsx">bad</boltAction></boltArtifact>' },
    { tool_calls: [] },
    { tool_calls: [{ name: "file.changed", args: { path: "frontend/App.tsx" } }] },
    { tool_calls: [{ name: "write_file", args: { path: "frontend/App.tsx" } }, { name: "complete", args: { summary: "done" } }] },
    { invalid_tool_calls: [{}], tool_calls: [{ name: "write_file", args: { path: "frontend/App.tsx", content: "bad" } }] },
  ]) assert.throws(() => parseWorkspaceToolDecision(response), /MODEL_/);
});

test("Go workspace instructions expose the platform-owned scaffold and required business files", () => {
  const instructions = workspaceAgentInstructions("GO");
  assert.match(instructions, /go\.mod.*platform/i);
  assert.match(instructions, /frontend\/App\.tsx/);
  assert.match(instructions, /backend\/operations\.go/);
  assert.match(instructions, /migrations\/\d+_/);
  assert.match(instructions, /acceptance\/seed\.json/);
  assert.match(instructions, /acceptance\/scenarios\.json/);
  assert.match(instructions, /empty workspace.*normal/i);
  assert.match(instructions, /currentFiles.*provided/i);
  assert.match(instructions, /search_files.*read_file_range.*patch_file.*run_command/i);
  assert.match(instructions, /write_file.*new or empty/i);
  assert.match(instructions, /rewrite_file.*exception/i);
});

test("accepts guarded rewrite tool calls", () => {
  assert.deepEqual(parseWorkspaceToolDecision({ tool_calls: [{ name: "rewrite_file", args: {
    path: "frontend/App.tsx", content: "next", expectedSha256: "abc", reason: "large refactor",
  } }] }), { kind: "tool", name: "rewrite_file", arguments: { path: "frontend/App.tsx", content: "next", expectedSha256: "abc", reason: "large refactor" } });
});
