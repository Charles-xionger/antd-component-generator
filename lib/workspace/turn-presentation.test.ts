import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkspaceTurnItems, shouldDisplayWorkspaceRun, workspaceTurnHeading } from "./turn-presentation";

const run = {
  status: "RUNNING",
  summary: null,
  nextStep: 4,
  maxSteps: 30,
};

test("workspace events become a Codex-style turn instead of one progress card", () => {
  const items = buildWorkspaceTurnItems(run, [
    { sequence: 1, type: "plan.updated", payload: { summary: "实现任务面板", steps: [{ id: "inspect", title: "检查现有代码", status: "completed" }] } },
    { sequence: 2, type: "tool.started", payload: { name: "read_file", path: "frontend/App.tsx" } },
    { sequence: 3, type: "tool.completed", payload: { name: "read_file", ok: true } },
    { sequence: 4, type: "file.changed", payload: { path: "frontend/App.tsx", revision: 2, content: "do not render this source" } },
    { sequence: 5, type: "validation.completed", payload: { status: "PASSED", diagnosticCount: 0 } },
  ]);

  assert.deepEqual(items.map((item) => item.kind), ["narrative", "plan", "activity", "files", "validation"]);
  assert.equal(items.find((item) => item.kind === "activity")?.kind, "activity");
  assert.equal(JSON.stringify(items).includes("do not render this source"), false);
  assert.equal(workspaceTurnHeading(run.status), "正在处理工作区");
});

test("terminal runs produce a final result item without presenting the step budget as progress", () => {
  const items = buildWorkspaceTurnItems(
    { ...run, status: "COMMITTED", summary: "已完成页面与校验" },
    [{ sequence: 1, type: "artifact.committed", payload: { revision: 8 } }],
  );

  assert.equal(items.at(-1)?.kind, "result");
  assert.match(JSON.stringify(items.at(-1)), /已完成页面与校验/);
  assert.equal(JSON.stringify(items).includes("30"), false);
  assert.equal(workspaceTurnHeading("COMMITTED"), "任务已完成");
});

test("queued runs explain that execution is waiting for an Agent worker", () => {
  const items = buildWorkspaceTurnItems(
    { ...run, status: "QUEUED", nextStep: 0 },
    [{ sequence: 1, type: "plan.updated", payload: { phase: "queued" } }],
  );

  assert.match(JSON.stringify(items), /等待执行器领取/);
});

test("cancelled runs remain persisted but are not restored into the message stream", () => {
  assert.equal(shouldDisplayWorkspaceRun("CANCELLED"), false);
  assert.equal(shouldDisplayWorkspaceRun("RUNNING"), true);
  assert.equal(shouldDisplayWorkspaceRun("FAILED"), true);
  assert.equal(shouldDisplayWorkspaceRun("COMMITTED"), true);
});
