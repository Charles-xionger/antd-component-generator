import assert from "node:assert/strict";
import test from "node:test";

import { resolveSandboxUrl } from "./sandbox-config";

test("points a bare sandbox origin at the renderer entry", () => {
  assert.equal(
    resolveSandboxUrl("http://127.0.0.1:5174"),
    "http://127.0.0.1:5174/sandbox.html",
  );
});

test("preserves an explicitly configured sandbox path", () => {
  assert.equal(
    resolveSandboxUrl("https://sandbox.example.com/renderer"),
    "https://sandbox.example.com/renderer",
  );
});
