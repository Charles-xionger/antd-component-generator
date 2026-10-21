import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { runBoundedProcess } from "./command";
import { compileBackendGo } from "./go-check";
import { materializeWorkspaceFiles } from "./projection";

test("Go compile reports a generated backend source location", async () => {
  const result = await compileBackendGo([{ path: "backend/operations.go", content: "package backend\nfunc Operations() { missingSymbol() }" }]);
  assert.equal(result.command.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.file === "backend/operations.go" && item.line === 2), JSON.stringify(result));
});

test("validator container cannot rewrite the source projection", async () => {
  const projection = await materializeWorkspaceFiles([{ path: "backend/operations.go", content: "original" }]);
  try {
    const result = await runBoundedProcess("docker", [
      "run", "--rm", "--pull=never", "--network=none", "--read-only",
      "--mount", `type=bind,src=${projection.directory},dst=/workspace,readonly`,
      "promptweb/workspace-go-validator:go1.24", "sh", "-c", "printf changed > /workspace/backend/operations.go",
    ], { timeoutMs: 10_000, maxOutputBytes: 1000, env: { NODE_ENV: "production", PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST, DOCKER_CONFIG: process.env.DOCKER_CONFIG } });
    assert.notEqual(result.exitCode, 0);
    assert.equal(await readFile(path.join(projection.directory, "backend/operations.go"), "utf8"), "original");
  } finally {
    await projection.dispose();
  }
});
