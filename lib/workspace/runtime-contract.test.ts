import assert from "node:assert/strict";
import test from "node:test";
import { assertWorkspaceMutationPath, repeatedObservationError } from "./runtime-contract";

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
