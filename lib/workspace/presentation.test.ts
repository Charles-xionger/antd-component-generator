import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceEventLabel, workspaceEventSection, workspaceRunLabel } from "./presentation";

test("committed code is not presented as a successful Preview", () => {
  assert.match(workspaceRunLabel("COMMITTED"), /代码已提交/);
  assert.match(workspaceRunLabel("COMMITTED"), /预览结果请查看右侧/);
  assert.match(workspaceEventLabel({ type: "artifact.committed", payload: {} }) || "", /Preview 将独立验证/);
});

test("tool internals are collapsed while meaningful events remain visible", () => {
  assert.equal(workspaceEventSection("tool.started"), "details");
  assert.equal(workspaceEventSection("tool.completed"), "details");
  assert.equal(workspaceEventSection("command.output"), "details");
  assert.equal(workspaceEventSection("file.changed"), "summary");
  assert.equal(workspaceEventSection("diagnostic.created"), "summary");
});

test("workspace activity displays file and diagnosis without source content", () => {
  assert.equal(workspaceEventLabel({ type: "plan.updated", payload: { summary: "Build the page", steps: [] } }), "计划已更新：Build the page");
  assert.equal(workspaceEventLabel({ type: "file.changed", payload: { path: "frontend/App.tsx", revision: 2, content: "secret code" } }), "已更新 frontend/App.tsx · 修订 2");
  assert.equal(workspaceEventLabel({ type: "command.output", payload: { output: "compiler raw text" } }), null);
  assert.match(workspaceEventLabel({ type: "diagnostic.created", payload: { diagnostic: { file: "frontend/App.tsx", message: "Syntax error" } } }) || "", /Syntax error/);
});
