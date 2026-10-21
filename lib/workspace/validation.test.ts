import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkspaceFiles } from "./validation";

test("known scenario root failure stops before expensive compilers", async () => {
  const result = await validateWorkspaceFiles([
    { path: "frontend/App.tsx", content: "export default function App() { return null; }" },
    { path: "backend/operations.go", content: "package backend\nfunc Operations() {}" },
    { path: "migrations/001_init.sql", content: "CREATE TABLE items (id int);" },
    { path: "acceptance/scenarios.json", content: "[]" },
  ], "GO");
  assert.ok(result.diagnostics.some((item) => item.code === "SCENARIO_SUITE_ROOT_TYPE"));
  assert.equal(result.checks.find((item) => item.name === "typescript")?.status, "skipped");
  assert.equal(result.checks.find((item) => item.name === "go_build")?.status, "skipped");
});

test("valid static files pass contract, typecheck and frontend build", async () => {
  const result = await validateWorkspaceFiles([{ path: "frontend/App.tsx", content: "export default function App() { return <div>Hello</div>; }" }], "STATIC");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.checks.find((item) => item.name === "frontend_build")?.status, "passed");
});
