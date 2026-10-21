import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceFrontend } from "./frontend-build";

test("front-end build reports a syntax error against the source file", async () => {
  const result = await buildWorkspaceFrontend([{ path: "frontend/App.tsx", content: "export default function App() { return <div>" }]);
  assert.notEqual(result.command.exitCode, 0);
  assert.ok(result.diagnostics.some((item) => item.file === "frontend/App.tsx"));
});

test("front-end build succeeds for a minimal component", async () => {
  const result = await buildWorkspaceFrontend([{ path: "frontend/App.tsx", content: "export default function App() { return <div>Hello</div>; }" }]);
  assert.equal(result.command.exitCode, 0, result.command.output);
  assert.deepEqual(result.diagnostics, []);
});
