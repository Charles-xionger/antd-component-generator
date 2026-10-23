import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWorkspaceMutationPath,
  evaluateWorkspacePolicy,
  isTargetedValidationForPath,
  repeatedObservationError,
  type WorkspacePolicyEvidence,
} from "./runtime-contract";

test("Go workspaces reject platform files before they reach draft storage", () => {
  assert.throws(() => assertWorkspaceMutationPath("go.mod", "GO"), (error: unknown) => {
    return error instanceof Error && "code" in error && error.code === "PLATFORM_FILE_NOT_WRITABLE";
  });
  assert.throws(() => assertWorkspaceMutationPath("backend/runtime.go", "GO"), (error: unknown) => {
    return error instanceof Error && "code" in error && error.code === "PLATFORM_FILE_NOT_WRITABLE";
  });
  assert.doesNotThrow(() => assertWorkspaceMutationPath("backend/operations.go", "GO"));
  assert.doesNotThrow(() => assertWorkspaceMutationPath("migrations/001_init.sql", "GO"));
});

test("runtime-specific roots are enforced for every mutation", () => {
  assert.throws(() => assertWorkspaceMutationPath("backend/operations.go", "STATIC"), (error: unknown) => {
    return error instanceof Error && "code" in error && error.code === "FILE_PATH_NOT_ALLOWED";
  });
  assert.doesNotThrow(() => assertWorkspaceMutationPath("frontend/App.tsx", "STATIC"));
});

test("a repeated observation receives actionable recovery guidance", () => {
  const result = repeatedObservationError("list_files", 0);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REPEATED_OBSERVATION");
  assert.match(result.error.message, /workspace is empty/i);
  assert.match(result.error.message, /write the next required file/i);
});

const evidence = (overrides: Partial<WorkspacePolicyEvidence> = {}): WorkspacePolicyEvidence => ({
  revision: 4,
  locatedPaths: new Set(),
  ranges: [],
  fullReads: new Map(),
  patchConflicts: new Map(),
  rewriteDebt: null,
  fingerprint: "empty",
  ...overrides,
});

test("existing files require current-revision location and bounded observation before patch", () => {
  const missing = evaluateWorkspacePolicy({
    action: "patch_file", path: "frontend/App.tsx", oldText: "old", fileExists: true, fileIsEmpty: false,
  }, evidence());
  assert.equal(missing?.code, "OBSERVATION_REQUIRED");
  assert.deepEqual(missing?.allowedNextActions, ["search_files", "read_file_range"]);

  const locatedOnly = evaluateWorkspacePolicy({
    action: "patch_file", path: "frontend/App.tsx", oldText: "old", fileExists: true, fileIsEmpty: false,
  }, evidence({ locatedPaths: new Set(["frontend/App.tsx"]) }));
  assert.equal(locatedOnly?.code, "OBSERVATION_REQUIRED");

  const permitted = evaluateWorkspacePolicy({
    action: "patch_file", path: "frontend/App.tsx", oldText: "old", fileExists: true, fileIsEmpty: false,
  }, evidence({ locatedPaths: new Set(["frontend/App.tsx"]), ranges: [{ path: "frontend/App.tsx", startLine: 2, endLine: 4, content: "before\nold\nafter" }] }));
  assert.equal(permitted, null);
});

test("whole-file writes are limited to new or empty files", () => {
  assert.equal(evaluateWorkspacePolicy({ action: "write_file", path: "frontend/New.tsx", fileExists: false, fileIsEmpty: false }, evidence()), null);
  assert.equal(evaluateWorkspacePolicy({ action: "write_file", path: "frontend/Empty.tsx", fileExists: true, fileIsEmpty: true }, evidence()), null);
  const denied = evaluateWorkspacePolicy({ action: "write_file", path: "frontend/App.tsx", fileExists: true, fileIsEmpty: false }, evidence());
  assert.equal(denied?.code, "PATCH_REQUIRED");
  assert.deepEqual(denied?.allowedNextActions, ["search_files", "read_file_range", "patch_file"]);
});

test("guarded rewrites require a full current read and an exceptional condition", () => {
  const base = { action: "rewrite_file" as const, path: "frontend/App.tsx", fileExists: true, fileIsEmpty: false, expectedSha256: "abc", reason: "large refactor", replacementRatio: 0.9 };
  assert.equal(evaluateWorkspacePolicy(base, evidence())?.code, "OBSERVATION_REQUIRED");
  const read = evidence({ fullReads: new Map([["frontend/App.tsx", "abc"]]) });
  assert.equal(evaluateWorkspacePolicy({ ...base, replacementRatio: 0.2 }, read)?.code, "PATCH_REQUIRED");
  assert.equal(evaluateWorkspacePolicy(base, read), null);
  assert.equal(evaluateWorkspacePolicy({ ...base, replacementRatio: 0.2 }, evidence({ fullReads: new Map([["frontend/App.tsx", "abc"]]), patchConflicts: new Map([["frontend/App.tsx", 2]]) })), null);
});

test("rewrite validation debt blocks mutations and completion until targeted validation passes", () => {
  const indebted = evidence({ rewriteDebt: { path: "frontend/App.tsx", revision: 4, auditItemId: "rewrite-1" } });
  assert.equal(evaluateWorkspacePolicy({ action: "patch_file", path: "frontend/Other.tsx", oldText: "x", fileExists: true, fileIsEmpty: false }, indebted)?.code, "VALIDATION_REQUIRED");
  assert.equal(evaluateWorkspacePolicy({ action: "complete" }, indebted)?.code, "VALIDATION_REQUIRED");
  assert.equal(evaluateWorkspacePolicy({ action: "run_command" }, indebted), null);
});

test("rewrite validation debt is cleared only by a check relevant to the rewritten path", () => {
  assert.equal(isTargetedValidationForPath("frontend/App.tsx", "run_command", "typecheck_frontend"), true);
  assert.equal(isTargetedValidationForPath("frontend/App.tsx", "run_command", "build_backend"), false);
  assert.equal(isTargetedValidationForPath("backend/operations.go", "run_command", "build_backend"), true);
  assert.equal(isTargetedValidationForPath("backend/operations.go", "run_command", "build_frontend"), false);
  assert.equal(isTargetedValidationForPath("acceptance/scenarios.json", "validate_workspace"), true);
});
