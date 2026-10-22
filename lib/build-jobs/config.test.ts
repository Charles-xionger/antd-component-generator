import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveBuildsRoot } from "./config";

test("uses a writable project-local build directory during development", () => {
  assert.equal(resolveBuildsRoot({}, "/workspace/app"), path.resolve("/workspace/app/.app-builds"));
});

test("preserves the container build directory in production", () => {
  assert.equal(resolveBuildsRoot({ NODE_ENV: "production" }, "/workspace/app"), "/app-builds");
});

test("honors an explicit build directory", () => {
  assert.equal(resolveBuildsRoot({ APP_BUILDS_ROOT: "/tmp/builds" }, "/workspace/app"), "/tmp/builds");
});
