import assert from "node:assert/strict";
import test from "node:test";

import { createDeploymentEventsHandler } from "./deployment-stream";
import type { DeploymentStatusSnapshot } from "./deployment-status";

function staticSnapshot(): DeploymentStatusSnapshot {
  return {
    deploymentId: "deployment-static",
    projectId: "project-1",
    projectName: "Landing page",
    versionNumber: 4,
    runtimeType: "STATIC",
    state: "success",
    progress: {
      stage: "switching",
      stageLabel: "切换流量",
      progress: 100,
      title: "发布成功",
      detail: "公开地址已切换到新版本",
      outcome: "success",
    },
    publishedUrl: "https://landing.example.test",
    endpoint: null,
    previousVersionAvailable: false,
    jobId: null,
    activities: [],
    lastSequence: 0,
    createdAt: "2026-10-21T10:00:00.000Z",
    startedAt: null,
    completedAt: "2026-10-21T10:00:01.000Z",
    error: null,
    terminal: true,
  };
}

function runningSnapshot(
  sequences: number[],
  options: { state?: "running" | "success"; status?: "BUILDING" | "VERIFYING" | "SUCCEEDED" } = {},
): DeploymentStatusSnapshot {
  const status = options.status || "BUILDING";
  const progress = status === "SUCCEEDED"
    ? staticSnapshot().progress
    : status === "VERIFYING"
      ? {
          stage: "verifying" as const,
          stageLabel: "验证",
          progress: 86,
          title: "正在验证可访问性",
          detail: "验证通过后才会切换公开地址",
          outcome: "running" as const,
        }
      : {
          stage: "building" as const,
          stageLabel: "构建",
          progress: 20,
          title: "正在构建应用",
          detail: "正在生成可发布的应用版本",
          outcome: "running" as const,
        };
  const state = options.state || "running";
  return {
    ...staticSnapshot(),
    deploymentId: "deployment-go",
    runtimeType: "GO",
    state,
    progress: state === "success" ? staticSnapshot().progress : progress,
    jobId: "job-1",
    activities: sequences.map((sequence) => ({
      jobId: "job-1",
      version: 1 as const,
      sequence,
      timestamp: `2026-10-21T10:00:0${sequence}.000Z`,
      stage: sequence === 1 ? "building" as const : "verifying" as const,
      level: sequence === 3 ? "success" as const : "info" as const,
      message: `event ${sequence}`,
    })),
    lastSequence: sequences.at(-1) || 0,
    completedAt: state === "success" ? "2026-10-21T10:00:03.000Z" : null,
    terminal: state === "success",
  };
}

test("rejects unauthenticated publication event subscriptions", async () => {
  let loaded = false;
  const handle = createDeploymentEventsHandler({
    authenticate: async () => null,
    loadSnapshot: async () => {
      loaded = true;
      return null;
    },
  });

  const response = await handle(
    new Request("https://oompt.test/api/deployments/deployment-1/events"),
    "deployment-1",
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(loaded, false);
});

test("does not reveal deployments outside the authenticated owner scope", async () => {
  const handle = createDeploymentEventsHandler({
    authenticate: async () => "user-other",
    loadSnapshot: async () => null,
  });
  const response = await handle(
    new Request("https://oompt.test/api/deployments/deployment-private/events"),
    "deployment-private",
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Deployment not found" });
});

test("sends a complete snapshot for a synchronous deployment and closes the stream", async () => {
  const snapshot = staticSnapshot();
  const handle = createDeploymentEventsHandler({
    authenticate: async () => "user-1",
    loadSnapshot: async () => snapshot,
  });

  const response = await handle(
    new Request("https://oompt.test/api/deployments/deployment-static/events"),
    "deployment-static",
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/event-stream/);
  assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
  assert.match(body, /event: snapshot\ndata: /);
  assert.match(body, new RegExp(JSON.stringify(snapshot).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, /event: complete\ndata: \{"state":"success","lastSequence":0\}/);
  assert.doesNotMatch(body, /event: activity/);
});

test("streams only new activities and status changes after the initial snapshot", async () => {
  const snapshots = [
    runningSnapshot([1]),
    runningSnapshot([1, 2], { status: "VERIFYING" }),
    runningSnapshot([1, 2, 3], { state: "success", status: "SUCCEEDED" }),
  ];
  const handle = createDeploymentEventsHandler({
    authenticate: async () => "user-1",
    loadSnapshot: async () => snapshots.shift() || null,
    pollIntervalMs: 0,
  });

  const response = await handle(
    new Request("https://oompt.test/api/deployments/deployment-go/events"),
    "deployment-go",
  );
  const body = await response.text();

  assert.equal((body.match(/event: snapshot/g) || []).length, 1);
  assert.doesNotMatch(body, /id: 1\nevent: activity/);
  assert.match(body, /id: 2\nevent: activity/);
  assert.match(body, /id: 3\nevent: activity/);
  assert.match(body, /event: status\ndata: .*"stage":"verifying"/);
  assert.match(body, /event: complete\ndata: \{"state":"success","lastSequence":3\}/);
});

test("resumes after Last-Event-ID without replaying the snapshot or seen activities", async () => {
  const handle = createDeploymentEventsHandler({
    authenticate: async () => "user-1",
    loadSnapshot: async () => runningSnapshot(
      [1, 2, 3],
      { state: "success", status: "SUCCEEDED" },
    ),
  });
  const response = await handle(
    new Request("https://oompt.test/api/deployments/deployment-go/events", {
      headers: { "Last-Event-ID": "1" },
    }),
    "deployment-go",
  );
  const body = await response.text();

  assert.doesNotMatch(body, /event: snapshot/);
  assert.doesNotMatch(body, /id: 1\nevent: activity/);
  assert.match(body, /id: 2\nevent: activity/);
  assert.match(body, /id: 3\nevent: activity/);
  assert.match(body, /event: status/);
  assert.match(body, /event: complete/);
});

test("emits a safe named error before completing a failed deployment", async () => {
  const failed: DeploymentStatusSnapshot = {
    ...runningSnapshot([1]),
    state: "failed",
    progress: {
      stage: "verifying",
      stageLabel: "验证",
      progress: 86,
      title: "发布未完成",
      detail: "新版本未切换，原线上版本不受影响",
      outcome: "failed",
    },
    error: {
      code: "health_check_failed",
      title: "应用启动后未通过访问检查",
      cause: "新版本没有在规定时间内返回正常的健康状态。",
      recommendation: "检查启动逻辑和健康检查接口，然后重新发布。",
      stage: "verifying",
      stageLabel: "验证",
      technicalMessage: "health check failed",
    },
    terminal: true,
  };
  const handle = createDeploymentEventsHandler({
    authenticate: async () => "user-1",
    loadSnapshot: async () => failed,
  });
  const response = await handle(
    new Request("https://oompt.test/api/deployments/deployment-go/events"),
    "deployment-go",
  );
  const body = await response.text();

  assert.match(body, /event: error\ndata: .*"health_check_failed"/);
  assert.ok(body.indexOf("event: error") < body.indexOf("event: complete"));
});
