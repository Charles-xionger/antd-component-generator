import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanSummary,
  buildResultSummary,
  summarizeToolActivity,
} from "./item-presentation";

test("groups repetitive tool calls into a compact activity summary", () => {
  const summary = summarizeToolActivity([
    { name: "read_file", status: "success" },
    { name: "read_file", status: "success" },
    { name: "search_files", status: "success" },
    { name: "run_tests", status: "running" },
  ]);

  assert.equal(summary.label, "读取 2 个文件 · 搜索 1 次 · 运行 1 项检查");
  assert.equal(summary.status, "running");
  assert.equal(summary.total, 4);
});

test("reports durable plan progress without counting conversational stages", () => {
  const summary = buildPlanSummary([
    { stage: "intent", status: "completed" },
    { stage: "architecture", status: "completed" },
    { stage: "coding", status: "running" },
    { stage: "validating", status: "pending" },
  ]);

  assert.deepEqual(summary, {
    completed: 1,
    total: 3,
    label: "1/3",
    status: "running",
  });
});

test("describes a saved artifact as an actionable version result", () => {
  assert.deepEqual(buildResultSummary(6, 12), {
    title: "可用版本 v6 已准备",
    description: "已生成并保存 12 个文件",
  });
});
