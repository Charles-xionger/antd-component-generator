import assert from "node:assert/strict";
import test from "node:test";
import { typecheckFrontend } from "./typecheck";

test("front-end typecheck returns a file-positioned diagnostic", async () => {
  const diagnostics = await typecheckFrontend([{ path: "frontend/App.tsx", content: "const value: string = 42;\nexport default function App() { return value; }" }]);
  assert.ok(diagnostics.some((item) => item.code === "TS2322" && item.file === "frontend/App.tsx" && item.line === 1));
});

test("front-end typecheck accepts a valid component", async () => {
  const diagnostics = await typecheckFrontend([{ path: "frontend/App.tsx", content: "export default function App() { return null; }" }]);
  assert.deepEqual(diagnostics, []);
});
