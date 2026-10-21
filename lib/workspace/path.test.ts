import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkspacePath } from "./path";

test("accepts a normalized relative source path", () => {
  assert.equal(normalizeWorkspacePath("frontend/App.tsx"), "frontend/App.tsx");
});

test("rejects traversal, absolute paths, alternate separators and hidden segments", () => {
  for (const path of ["/etc/passwd", "../secret", "frontend/../secret", "frontend\\App.tsx", "frontend//App.tsx", "frontend/.git/config", "frontend/%2e%2e/secret", "C:/secret", "frontend/\0x"]) {
    assert.throws(() => normalizeWorkspacePath(path), { code: "INVALID_WORKSPACE_PATH" });
  }
});
