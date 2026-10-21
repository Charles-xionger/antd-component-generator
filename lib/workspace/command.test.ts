import assert from "node:assert/strict";
import test from "node:test";
import { runBoundedProcess } from "./command";

test("bounded process records exit code and output", async () => {
  const result = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('ok')"], { timeoutMs: 2000, maxOutputBytes: 100 });
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "ok");
  assert.equal(result.timedOut, false);
});

test("bounded process stops on output overflow", async () => {
  const result = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(10000))"], { timeoutMs: 2000, maxOutputBytes: 100 });
  assert.equal(result.output.length, 100);
  assert.equal(result.outputTruncated, true);
});

test("bounded process stops on timeout", async () => {
  const result = await runBoundedProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 100, maxOutputBytes: 100 });
  assert.equal(result.timedOut, true);
});

test("default validation process environment does not inherit application secrets", async () => {
  process.env.WORKSPACE_TEST_SECRET = "must-not-leak";
  try {
    const result = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write(process.env.WORKSPACE_TEST_SECRET ?? '')"], { timeoutMs: 2000, maxOutputBytes: 100 });
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "");
  } finally {
    delete process.env.WORKSPACE_TEST_SECRET;
  }
});
