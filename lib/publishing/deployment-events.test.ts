import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLICATION_STAGES,
  appendPublicationActivity,
  classifyPublicationError,
  getPublicationActivitiesAfter,
  getPublicationProgress,
  limitPublicationLog,
  mergePublicationActivities,
  parsePublicationLog,
  publicationActivityForStatus,
  sanitizePublicationText,
} from "./deployment-events";

test("maps every worker status to stable user-facing publication progress", () => {
  assert.deepEqual(PUBLICATION_STAGES, [
    "preparing",
    "building",
    "uploading",
    "starting",
    "verifying",
    "switching",
  ]);

  assert.deepEqual(getPublicationProgress("QUEUED"), {
    stage: "preparing",
    stageLabel: "准备",
    progress: 5,
    title: "正在准备发布",
    detail: "正在确认版本和发布资源",
    outcome: "running",
  });
  assert.equal(getPublicationProgress("BUILDING").stage, "building");
  assert.equal(getPublicationProgress("TESTING").stage, "building");
  assert.equal(getPublicationProgress("MIGRATING").stage, "uploading");
  assert.equal(getPublicationProgress("STARTING").stage, "starting");
  assert.equal(getPublicationProgress("VERIFYING").stage, "verifying");
  assert.deepEqual(getPublicationProgress("SUCCEEDED"), {
    stage: "switching",
    stageLabel: "切换流量",
    progress: 100,
    title: "发布成功",
    detail: "公开地址已切换到新版本",
    outcome: "success",
  });
  assert.equal(getPublicationProgress("FAILED").outcome, "failed");
});

test("bounds stored logs at complete-line boundaries while preserving the newest sequence", () => {
  const result = [1, 2, 3, 4].reduce((current, sequence) => appendPublicationActivity(current, {
    timestamp: `2026-10-21T09:00:0${sequence}.000Z`,
    stage: "building",
    level: "info",
    message: `${sequence}:${"x".repeat(900)}`,
  }).log, "");
  const bounded = limitPublicationLog(result, 2_200);
  const parsed = parsePublicationLog(bounded);

  assert.ok(bounded.length <= 2_200);
  assert.equal(parsed.at(-1)?.sequence, 4);
  assert.ok(parsed[0].sequence > 1);
  assert.doesNotMatch(parsed[0].message, /^\{"version"/);
});

test("creates readable worker activities for every status transition", () => {
  assert.deepEqual(publicationActivityForStatus("MIGRATING"), {
    stage: "uploading",
    level: "info",
    message: "正在上传产物并准备应用数据",
  });
  assert.deepEqual(publicationActivityForStatus("SUCCEEDED"), {
    stage: "switching",
    level: "success",
    message: "验证通过，公开地址已切换到新版本",
  });
  assert.deepEqual(publicationActivityForStatus("FAILED", "health check failed"), {
    stage: "verifying",
    level: "error",
    message: "health check failed",
  });
});

test("returns only activities newer than a reconnect cursor", () => {
  const log = [1, 2, 3].reduce<string>((current, sequence) => appendPublicationActivity(current, {
    timestamp: `2026-10-21T09:00:0${sequence}.000Z`,
    stage: "building",
    level: "info",
    message: `event ${sequence}`,
  }).log, "");

  assert.deepEqual(
    getPublicationActivitiesAfter(log, 1).map((event) => event.sequence),
    [2, 3],
  );
  assert.deepEqual(getPublicationActivitiesAfter(log, 3), []);
});

test("classifies known failures into safe recovery advice and falls back for unknown errors", () => {
  assert.deepEqual(
    classifyPublicationError("Go application health check returned an invalid response"),
    {
      code: "health_check_failed",
      title: "应用启动后未通过访问检查",
      cause: "新版本没有在规定时间内返回正常的健康状态。",
      recommendation: "检查启动逻辑和健康检查接口，然后重新发布。",
    },
  );
  assert.deepEqual(classifyPublicationError("rm -rf /; do this now"), {
    code: "unknown",
    title: "发布过程中遇到未识别的问题",
    cause: "系统已停止切换，新版本没有影响当前线上版本。",
    recommendation: "复制技术日志进行排查，修复后重新发布。",
  });
});

test("redacts credentials and bounds text before it can reach a browser", () => {
  const raw = [
    "DATABASE_URL=postgresql://admin:hunter2@db.internal/app",
    "API_SECRET=super-private-value",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.private.signature",
    `<script>alert("unsafe")</script>`,
    "x".repeat(5_000),
  ].join("\n");
  const safe = sanitizePublicationText(raw, 512);

  assert.doesNotMatch(safe, /hunter2|super-private-value|private\.signature/);
  assert.match(safe, /DATABASE_URL=\[REDACTED\]/);
  assert.match(safe, /API_SECRET=\[REDACTED\]/);
  assert.match(safe, /Authorization: Bearer \[REDACTED\]/);
  assert.match(safe, /&lt;script&gt;/);
  assert.ok(safe.length <= 512);
});

test("merges resumed activities by job and sequence without duplicates", () => {
  const activity = (sequence: number, message: string) => ({
    version: 1 as const,
    sequence,
    timestamp: `2026-10-21T09:00:0${sequence}.000Z`,
    stage: "building" as const,
    level: "info" as const,
    message,
  });
  const merged = mergePublicationActivities(
    [
      { jobId: "job-a", ...activity(1, "one") },
      { jobId: "job-a", ...activity(2, "two") },
    ],
    [
      { jobId: "job-a", ...activity(2, "two repeated") },
      { jobId: "job-b", ...activity(1, "another job") },
      { jobId: "job-a", ...activity(3, "three") },
    ],
  );

  assert.deepEqual(
    merged.map(({ jobId, sequence, message }) => ({ jobId, sequence, message })),
    [
      { jobId: "job-a", sequence: 1, message: "one" },
      { jobId: "job-a", sequence: 2, message: "two" },
      { jobId: "job-b", sequence: 1, message: "another job" },
      { jobId: "job-a", sequence: 3, message: "three" },
    ],
  );
});

test("appends versioned JSONL activities with monotonic sequence numbers", () => {
  const first = appendPublicationActivity(null, {
    timestamp: "2026-10-21T09:00:00.000Z",
    stage: "preparing",
    level: "info",
    message: "发布任务已进入队列",
  });
  const second = appendPublicationActivity(first.log, {
    timestamp: "2026-10-21T09:00:01.000Z",
    stage: "building",
    level: "info",
    message: "开始构建应用",
  });

  assert.equal(first.event.sequence, 1);
  assert.equal(second.event.sequence, 2);
  assert.deepEqual(parsePublicationLog(second.log), [first.event, second.event]);
});

test("keeps legacy plain-text build logs readable when structured activities are appended", () => {
  const legacy = "[BUILDING]\ncompiler: preparing packages\n";
  const appended = appendPublicationActivity(legacy, {
    timestamp: "2026-10-21T09:00:02.000Z",
    stage: "building",
    level: "success",
    message: "构建产物已准备完成",
  });

  assert.equal(appended.event.sequence, 3);
  assert.deepEqual(
    parsePublicationLog(appended.log).map(({ sequence, stage, level, message }) => ({
      sequence,
      stage,
      level,
      message,
    })),
    [
      { sequence: 1, stage: "building", level: "info", message: "[BUILDING]" },
      { sequence: 2, stage: "building", level: "info", message: "compiler: preparing packages" },
      { sequence: 3, stage: "building", level: "success", message: "构建产物已准备完成" },
    ],
  );
});

test("keeps the last active stage when a legacy log ends in failure", () => {
  const events = parsePublicationLog("[MIGRATING]\napplying schema\n[FAILED] migration rejected\n");

  assert.equal(events.at(-1)?.stage, "uploading");
  assert.equal(events.at(-1)?.level, "error");
});
