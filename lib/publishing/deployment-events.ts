export const PUBLICATION_STAGES = [
  "preparing",
  "building",
  "uploading",
  "starting",
  "verifying",
  "switching",
] as const;

export type PublicationStage = (typeof PUBLICATION_STAGES)[number];
export type PublicationOutcome = "running" | "success" | "failed";

export interface PublicationProgress {
  stage: PublicationStage;
  stageLabel: string;
  progress: number;
  title: string;
  detail: string;
  outcome: PublicationOutcome;
}

export type PublicationActivityLevel = "info" | "success" | "warning" | "error";

export interface PublicationActivity {
  version: 1;
  sequence: number;
  timestamp: string;
  stage: PublicationStage;
  level: PublicationActivityLevel;
  message: string;
}

export interface PublicationErrorResolution {
  code: "build_failed" | "data_preparation_failed" | "start_failed" | "health_check_failed" | "unknown";
  title: string;
  cause: string;
  recommendation: string;
}

export type NewPublicationActivity = Omit<PublicationActivity, "version" | "sequence">;
export type JobPublicationActivity = PublicationActivity & { jobId: string };

const DEFAULT_TEXT_LIMIT = 4_000;

export function sanitizePublicationText(
  value: string | null | undefined,
  maxLength = DEFAULT_TEXT_LIMIT,
): string {
  const redacted = (value || "")
    .replace(/\b((?:DATABASE_URL|MIGRATOR_DATABASE_URL|APP_RUNTIME_DATABASE_URL|PASSWORD|PASSWD|API[_-]?KEY|API[_-]?SECRET|SECRET|TOKEN|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/\b(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const escaped = redacted
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return escaped.length <= maxLength
    ? escaped
    : `${escaped.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function classifyPublicationError(message: string | null | undefined): PublicationErrorResolution {
  const normalized = (message || "").toLowerCase();
  if (/health|healthz|健康检查|invalid response/.test(normalized)) {
    return {
      code: "health_check_failed",
      title: "应用启动后未通过访问检查",
      cause: "新版本没有在规定时间内返回正常的健康状态。",
      recommendation: "检查启动逻辑和健康检查接口，然后重新发布。",
    };
  }
  if (/migration|migrat|schema|数据库迁移|准备数据/.test(normalized)) {
    return {
      code: "data_preparation_failed",
      title: "应用数据准备未完成",
      cause: "新版本需要的数据结构没有成功准备。",
      recommendation: "检查数据库变更是否为可向前执行的安全迁移，然后重新发布。",
    };
  }
  if (/docker build|compile|compiler|构建|syntax|type error/.test(normalized)) {
    return {
      code: "build_failed",
      title: "应用构建未完成",
      cause: "生成的代码或依赖没有通过构建检查。",
      recommendation: "根据构建日志修复代码或依赖问题，然后重新发布。",
    };
  }
  if (/start|启动|container|listen|port/.test(normalized)) {
    return {
      code: "start_failed",
      title: "新版本未能正常启动",
      cause: "应用进程启动失败，公开地址没有切换。",
      recommendation: "检查启动配置和运行时错误，然后重新发布。",
    };
  }
  return {
    code: "unknown",
    title: "发布过程中遇到未识别的问题",
    cause: "系统已停止切换，新版本没有影响当前线上版本。",
    recommendation: "复制技术日志进行排查，修复后重新发布。",
  };
}

const progressByStatus: Record<string, PublicationProgress> = {
  QUEUED: {
    stage: "preparing",
    stageLabel: "准备",
    progress: 5,
    title: "正在准备发布",
    detail: "正在确认版本和发布资源",
    outcome: "running",
  },
  BUILDING: {
    stage: "building",
    stageLabel: "构建",
    progress: 20,
    title: "正在构建应用",
    detail: "正在生成可发布的应用版本",
    outcome: "running",
  },
  TESTING: {
    stage: "building",
    stageLabel: "构建",
    progress: 38,
    title: "正在检查构建产物",
    detail: "正在确认应用可以安全启动",
    outcome: "running",
  },
  MIGRATING: {
    stage: "uploading",
    stageLabel: "上传",
    progress: 55,
    title: "正在准备发布资源",
    detail: "正在上传产物并准备应用数据",
    outcome: "running",
  },
  STARTING: {
    stage: "starting",
    stageLabel: "启动",
    progress: 70,
    title: "正在启动新版本",
    detail: "当前线上版本仍可正常访问",
    outcome: "running",
  },
  VERIFYING: {
    stage: "verifying",
    stageLabel: "验证",
    progress: 86,
    title: "正在验证可访问性",
    detail: "验证通过后才会切换公开地址",
    outcome: "running",
  },
  SUCCEEDED: {
    stage: "switching",
    stageLabel: "切换流量",
    progress: 100,
    title: "发布成功",
    detail: "公开地址已切换到新版本",
    outcome: "success",
  },
  FAILED: {
    stage: "verifying",
    stageLabel: "验证",
    progress: 86,
    title: "发布未完成",
    detail: "新版本未切换，原线上版本不受影响",
    outcome: "failed",
  },
};

export function getPublicationProgress(status: string): PublicationProgress {
  return progressByStatus[status] ?? progressByStatus.QUEUED;
}

const activityMessageByStatus: Record<string, string> = {
  QUEUED: "发布任务已进入队列",
  BUILDING: "正在构建应用",
  TESTING: "正在检查构建产物",
  MIGRATING: "正在上传产物并准备应用数据",
  STARTING: "正在启动新版本",
  VERIFYING: "正在验证新版本是否可访问",
  SUCCEEDED: "验证通过，公开地址已切换到新版本",
};

export function publicationActivityForStatus(
  status: string,
  message?: string,
  failedFromStatus = "VERIFYING",
): Omit<NewPublicationActivity, "timestamp"> {
  if (status === "FAILED") {
    return {
      stage: getPublicationProgress(failedFromStatus).stage,
      level: "error",
      message: message || "发布任务未完成",
    };
  }
  return {
    stage: getPublicationProgress(status).stage,
    level: status === "SUCCEEDED" ? "success" : "info",
    message: message || activityMessageByStatus[status] || "发布状态已更新",
  };
}

function isPublicationActivity(value: unknown): value is PublicationActivity {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PublicationActivity>;
  return event.version === 1
    && typeof event.sequence === "number"
    && Number.isSafeInteger(event.sequence)
    && event.sequence > 0
    && typeof event.timestamp === "string"
    && PUBLICATION_STAGES.includes(event.stage as PublicationStage)
    && ["info", "success", "warning", "error"].includes(event.level || "")
    && typeof event.message === "string";
}

export function parsePublicationLog(log: string | null | undefined): PublicationActivity[] {
  if (!log) return [];
  const events: PublicationActivity[] = [];
  let legacyStage: PublicationStage = "preparing";
  for (const rawLine of log.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isPublicationActivity(parsed)) {
        events.push({
          ...parsed,
          message: sanitizePublicationText(parsed.message),
        });
        legacyStage = parsed.stage;
        continue;
      }
    } catch {
      // Existing BuildJob.log values are plain text and remain visible as
      // synthetic v1 activities while new lines use the JSONL format.
    }
    const status = line.match(/^\[(QUEUED|BUILDING|TESTING|MIGRATING|STARTING|VERIFYING|SUCCEEDED|FAILED)\]/)?.[1];
    if (status && status !== "FAILED") {
      legacyStage = getPublicationProgress(status).stage;
    }
    events.push({
      version: 1,
      sequence: (events.at(-1)?.sequence ?? 0) + 1,
      timestamp: "1970-01-01T00:00:00.000Z",
      stage: legacyStage,
      level: status === "FAILED" ? "error" : "info",
      message: sanitizePublicationText(line),
    });
  }
  return events;
}

export function appendPublicationActivity(
  log: string | null | undefined,
  input: NewPublicationActivity,
): { log: string; event: PublicationActivity } {
  const current = parsePublicationLog(log);
  const event: PublicationActivity = {
    version: 1,
    sequence: (current.at(-1)?.sequence ?? 0) + 1,
    ...input,
  };
  return {
    event,
    log: `${log || ""}${JSON.stringify(event)}\n`,
  };
}

export function limitPublicationLog(log: string, maxLength = 64_000): string {
  if (log.length <= maxLength) return log;
  const tail = log.slice(-maxLength);
  const firstCompleteLine = tail.indexOf("\n");
  return firstCompleteLine < 0 ? "" : tail.slice(firstCompleteLine + 1);
}

export function getPublicationActivitiesAfter(
  log: string | null | undefined,
  lastSequence: number,
): PublicationActivity[] {
  return parsePublicationLog(log).filter((event) => event.sequence > lastSequence);
}

export function mergePublicationActivities(
  current: JobPublicationActivity[],
  incoming: JobPublicationActivity[],
): JobPublicationActivity[] {
  const seen = new Set(current.map((event) => `${event.jobId}:${event.sequence}`));
  const merged = [...current];
  for (const event of incoming) {
    const key = `${event.jobId}:${event.sequence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged;
}
