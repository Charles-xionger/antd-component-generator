import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the unified development launcher starts every required runtime", () => {
  const source = readFileSync(new URL("./dev-all.mjs", import.meta.url), "utf8");
  for (const required of ["web", "workspace-agent", "build-worker", "sandbox", "worker:agent", "worker:build"]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
