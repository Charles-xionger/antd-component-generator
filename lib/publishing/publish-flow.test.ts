import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublishChecks,
  getPublishProgress,
  resolvePublishOutcome,
} from "./publish-flow";

test("static artifacts are ready when a generated version contains files", () => {
  const checks = getPublishChecks({
    versionNumber: 6,
    fileCount: 8,
    fullstackPreview: null,
  });

  assert.equal(checks.every((check) => check.status !== "blocked"), true);
  assert.deepEqual(
    checks.map((check) => check.label),
    ["版本已生成", "文件已保存", "发布构建", "公开访问"],
  );
});

test("a failed full-stack preview blocks publishing and explains why", () => {
  const checks = getPublishChecks({
    versionNumber: 3,
    fileCount: 12,
    fullstackPreview: {
      status: "FAILED",
      errorMessage: "健康检查未通过",
    },
  });

  assert.equal(checks.at(2)?.status, "blocked");
  assert.match(checks.at(2)?.detail || "", /健康检查未通过/);
});

test("publish progress maps backend build states to user-facing stages", () => {
  assert.deepEqual(getPublishProgress("BUILDING"), {
    activeStep: 1,
    title: "正在构建可发布版本",
  });
  assert.deepEqual(getPublishProgress("ACTIVE"), {
    activeStep: 3,
    title: "发布完成",
  });
});

test("polling resolves only the deployment created by this publish action", () => {
  const outcome = resolvePublishOutcome("deployment-new", [
    { id: "deployment-old", status: "FAILED", errorMessage: "旧错误" },
    { id: "deployment-new", status: "ACTIVE", errorMessage: null },
  ]);

  assert.deepEqual(outcome, { status: "success" });
  assert.deepEqual(resolvePublishOutcome("missing", []), { status: "pending" });
});
