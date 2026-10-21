import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { materializeWorkspaceFiles } from "./projection";

test("materializes exact workspace file contents in a disposable directory", async () => {
  const projection = await materializeWorkspaceFiles([
    { path: "frontend/App.tsx", content: "export default 1" },
    { path: "migrations/001_init.sql", content: "CREATE TABLE t (id int);" },
  ]);
  try {
    assert.equal(await readFile(path.join(projection.directory, "frontend/App.tsx"), "utf8"), "export default 1");
    assert.equal(projection.files.length, 2);
    assert.ok(projection.files[0].sha256);
  } finally {
    await projection.dispose();
  }
  await assert.rejects(stat(projection.directory), { code: "ENOENT" });
});

test("rejects unsafe paths and does not accept duplicate file names", async () => {
  await assert.rejects(materializeWorkspaceFiles([{ path: "../outside", content: "x" }]));
  await assert.rejects(materializeWorkspaceFiles([{ path: "frontend/App.tsx", content: "x" }, { path: "frontend/App.tsx", content: "y" }]));
});
