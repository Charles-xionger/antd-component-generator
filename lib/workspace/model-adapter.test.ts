import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkspaceToolDecision } from "./model-adapter";

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
