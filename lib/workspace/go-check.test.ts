import assert from "node:assert/strict";
import test from "node:test";
import { compileBackendGo } from "./go-check";

test("Go compile reports a generated backend source location", async () => {
  const result = await compileBackendGo([{ path: "backend/operations.go", content: "package backend\nfunc Operations() { missingSymbol() }" }]);
  assert.equal(result.command.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.file === "backend/operations.go" && item.line === 2), JSON.stringify(result));
});
