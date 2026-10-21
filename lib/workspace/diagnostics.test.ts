import assert from "node:assert/strict";
import test from "node:test";
import { validateAcceptanceScenarios, validateJsonFile, validateWorkspaceFileContract } from "./diagnostics";

test("JSON parse errors include file and source location", () => {
  const diagnostics = validateJsonFile("acceptance/seed.json", '{\n  "x":,\n}');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].source, "json");
  assert.equal(diagnostics[0].code, "JSON_PARSE_ERROR");
  assert.equal(diagnostics[0].file, "acceptance/seed.json");
  assert.ok(diagnostics[0].line && diagnostics[0].column);
});

test("known scenario root error reports expected object rather than an opaque schema failure", () => {
  const [diagnostic] = validateAcceptanceScenarios("[]");
  assert.equal(diagnostic.code, "SCENARIO_SUITE_ROOT_TYPE");
  assert.equal(diagnostic.file, "acceptance/scenarios.json");
  assert.equal(diagnostic.path, "$");
  assert.equal(diagnostic.expected, "object with scenarios array");
  assert.equal(diagnostic.actual, "array");
});

test("nested scenario schema errors preserve the field path", () => {
  const [diagnostic] = validateAcceptanceScenarios(JSON.stringify({ scenarios: [{ id: "valid.id", description: "ok", steps: [{ operationId: "abc", expectStatus: 999 }] }] }));
  assert.equal(diagnostic.source, "schema");
  assert.equal(diagnostic.path, "$.scenarios[0].steps[0].expectStatus");
});

test("static file contracts do not depend on a boltArtifact envelope", () => {
  const valid = validateWorkspaceFileContract([{ path: "frontend/App.tsx", content: "export default function App() { return null }" }], "STATIC");
  assert.deepEqual(valid, []);
  const invalid = validateWorkspaceFileContract([{ path: "backend/main.go", content: "package main" }], "STATIC");
  assert.ok(invalid.some((diagnostic) => diagnostic.code === "REQUIRED_FILE_MISSING" && diagnostic.file === "frontend/App.tsx"));
  assert.ok(invalid.some((diagnostic) => diagnostic.code === "FILE_PATH_NOT_ALLOWED" && diagnostic.file === "backend/main.go"));
});

test("Go file-level checks return structured migration and scenario diagnostics without XML", () => {
  const diagnostics = validateWorkspaceFileContract([
    { path: "frontend/App.tsx", content: "export default function App() { return null }" },
    { path: "backend/operations.go", content: "package backend\nfunc Operations() {}" },
    { path: "migrations/001_init.sql", content: "DROP TABLE records;" },
    { path: "acceptance/scenarios.json", content: "[]" },
  ], "GO");
  assert.ok(diagnostics.some((diagnostic) => diagnostic.source === "migration" && diagnostic.file === "migrations/001_init.sql"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "SCENARIO_SUITE_ROOT_TYPE"));
  assert.ok(diagnostics.every((diagnostic) => !diagnostic.message.includes("boltArtifact")));
});
