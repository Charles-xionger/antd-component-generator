import assert from "node:assert/strict";
import test from "node:test";
import {
  activityStreamReducer,
  deploymentStatusPath,
  getProjectReleaseState,
  RELEASE_STAGES,
  releaseConfirmationCopy,
} from "./realtime-ui";

test("uses the six confirmed user-facing stages", () => {
  assert.deepEqual(RELEASE_STAGES, ["准备", "构建", "上传", "启动", "验证", "切换流量"]);
  assert.equal(RELEASE_STAGES.some((stage) => stage.toLowerCase().includes("staging")), false);
});

test("activity stream pauses on upward scroll and counts only new unique events", () => {
  const paused = activityStreamReducer(
    { following: true, unreadCount: 0, eventKeys: ["job-1:1"] },
    { type: "pause" },
  );
  const appended = activityStreamReducer(paused, {
    type: "append",
    eventKeys: ["job-1:1", "job-1:2", "job-1:2", "job-1:3"],
  });
  assert.deepEqual(appended, {
    following: false,
    unreadCount: 2,
    eventKeys: ["job-1:1", "job-1:2", "job-1:3"],
  });
  assert.deepEqual(activityStreamReducer(appended, { type: "follow" }), {
    following: true,
    unreadCount: 0,
    eventKeys: appended.eventKeys,
  });
});

test("activity stream does not create unread events while following", () => {
  assert.deepEqual(
    activityStreamReducer(
      { following: true, unreadCount: 0, eventKeys: [] },
      { type: "append", eventKeys: ["job-2:1"] },
    ),
    { following: true, unreadCount: 0, eventKeys: ["job-2:1"] },
  );
});

test("release cards prioritize publishing and failed latest results", () => {
  assert.equal(getProjectReleaseState({ activeDeploymentId: "active", latestStatus: "BUILDING" }), "publishing");
  assert.equal(getProjectReleaseState({ activeDeploymentId: "active", latestStatus: "FAILED" }), "attention");
  assert.equal(getProjectReleaseState({ activeDeploymentId: "active", latestStatus: "ACTIVE" }), "online");
  assert.equal(getProjectReleaseState({ activeDeploymentId: null, latestStatus: "DISABLED" }), "offline");
});

test("status links and destructive confirmation copy explain the consequences", () => {
  assert.equal(deploymentStatusPath("dep 1"), "/deployments/dep%201");
  assert.match(releaseConfirmationCopy("rollback").description, /稳定 URL 不变/);
  assert.match(releaseConfirmationCopy("rollback").description, /数据与新版本都会保留/);
  assert.match(releaseConfirmationCopy("unpublish").description, /公开地址将停止访问/);
  assert.match(releaseConfirmationCopy("unpublish").description, /数据和版本都会保留/);
});
