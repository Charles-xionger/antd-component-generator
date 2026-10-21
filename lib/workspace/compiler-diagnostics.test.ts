import assert from "node:assert/strict";
import test from "node:test";
import { parseCompilerDiagnostics } from "./compiler-diagnostics";

test("TypeScript output retains file, position, code and bounded raw text", () => {
  const [error] = parseCompilerDiagnostics("typescript", "frontend/App.tsx(3,5): error TS2322: Type 'number' is not assignable to type 'string'.");
  assert.deepEqual({ source: error.source, code: error.code, file: error.file, line: error.line, column: error.column }, {
    source: "typescript", code: "TS2322", file: "frontend/App.tsx", line: 3, column: 5,
  });
  assert.match(error.raw!, /TS2322/);
});

test("Go output retains file and compiler text without leaking host paths", () => {
  const [error] = parseCompilerDiagnostics("go", "/tmp/workspace-projection-xyz/backend/operations.go:12:3: undefined: thing");
  assert.deepEqual({ code: error.code, file: error.file, line: error.line, column: error.column }, {
    code: "GO_COMPILE_ERROR", file: "backend/operations.go", line: 12, column: 3,
  });
  assert.equal(error.raw!.includes("/tmp/workspace-projection-xyz"), false);
});

test("unparsed command failures remain visible and output is capped", () => {
  const [error] = parseCompilerDiagnostics("go", "x".repeat(20_000));
  assert.equal(error.code, "GO_COMPILE_ERROR");
  assert.ok(error.raw!.length <= 4096);
});

test("unparsed compiler text also redacts temporary host paths", () => {
  const [error] = parseCompilerDiagnostics("go", "go: failed /var/folders/a/workspace-go-check-xyz/app");
  assert.equal(error.raw!.includes("/var/folders"), false);
});
