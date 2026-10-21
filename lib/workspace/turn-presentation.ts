export type WorkspaceTurnEvent = {
  sequence: number;
  type: string;
  payload: Record<string, unknown>;
};

export type WorkspaceTurnRun = {
  status: string;
  summary: string | null;
  nextStep: number;
  maxSteps: number;
};

export type WorkspaceTurnItem =
  | { kind: "narrative"; id: string; text: string; tone: "neutral" | "active" | "warning" | "error" | "success" }
  | { kind: "plan"; id: string; summary: string | null; steps: Array<{ id: string; title: string; status: string }> }
  | { kind: "activity"; id: string; entries: Array<{ sequence: number; label: string; output?: string }> }
  | { kind: "files"; id: string; files: Array<{ path: string; revision: string }> }
  | { kind: "validation"; id: string; passed: boolean; diagnosticCount: number }
  | { kind: "diagnostics"; id: string; diagnostics: Array<{ sequence: number; file: string | null; message: string; detail: string }> }
  | { kind: "result"; id: string; text: string; tone: "neutral" | "warning" | "error" | "success" };

const terminalStatuses = new Set(["NEEDS_INPUT", "NO_PROGRESS", "CANCELLED", "FAILED", "COMMITTED"]);

export function shouldDisplayWorkspaceRun(status: string): boolean {
  return status !== "CANCELLED";
}

export function workspaceTurnHeading(status: string): string {
  const headings: Record<string, string> = {
    QUEUED: "等待开始",
    RUNNING: "正在处理工作区",
    READY_TO_VALIDATE: "正在提交版本",
    NEEDS_INPUT: "需要你的确认",
    NO_PROGRESS: "任务已暂停",
    CANCELLED: "任务已取消",
    FAILED: "任务未完成",
    COMMITTED: "任务已完成",
  };
  return headings[status] ?? "工作区任务";
}

function narrativeFor(status: string): WorkspaceTurnItem & { kind: "narrative" } {
  const content: Record<string, { text: string; tone: "neutral" | "active" | "warning" | "error" | "success" }> = {
    QUEUED: { text: "任务已保存，正在等待执行器领取。", tone: "neutral" },
    RUNNING: { text: "正在检查工作区，并按文件增量修改与验证。", tone: "active" },
    READY_TO_VALIDATE: { text: "代码检查已通过，正在从当前工作区修订提交版本。", tone: "active" },
    NEEDS_INPUT: { text: "继续执行前需要补充一项决定。", tone: "warning" },
    NO_PROGRESS: { text: "相同问题重复出现，已停止无效重试。", tone: "warning" },
    CANCELLED: { text: "执行已取消，已经写入工作区的修改仍然保留。", tone: "neutral" },
    FAILED: { text: "任务未能完成，工作区与诊断信息已经保留。", tone: "error" },
    COMMITTED: { text: "修改和代码检查已经完成，版本已从工作区提交。", tone: "success" },
  };
  const selected = content[status] ?? { text: "工作区状态已更新。", tone: "neutral" as const };
  return { kind: "narrative", id: "run-narrative", ...selected };
}

function safeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function buildWorkspaceTurnItems(run: WorkspaceTurnRun, events: WorkspaceTurnEvent[]): WorkspaceTurnItem[] {
  const items: WorkspaceTurnItem[] = [narrativeFor(run.status)];
  const latestPlan = [...events].reverse().find((event) => event.type === "plan.updated" && Array.isArray(event.payload.steps));
  if (latestPlan) {
    const steps = (latestPlan.payload.steps as Array<Record<string, unknown>>).map((step, index) => ({
      id: safeText(step.id, `step-${index}`),
      title: safeText(step.title, "未命名步骤"),
      status: safeText(step.status, "pending"),
    }));
    items.push({ kind: "plan", id: `plan-${latestPlan.sequence}`, summary: safeText(latestPlan.payload.summary) || null, steps });
  }

  const activityEvents = events.filter((event) => ["tool.started", "tool.completed", "command.output", "model.response_rejected"].includes(event.type));
  if (activityEvents.length) {
    items.push({
      kind: "activity",
      id: "tool-activity",
      entries: activityEvents.map((event) => {
        const name = safeText(event.payload.name, safeText(event.payload.check, "操作"));
        const path = safeText(event.payload.path);
        const failed = event.type === "tool.completed" && event.payload.ok === false;
        const label = event.type === "command.output"
          ? `命令输出 · ${name}`
          : event.type === "model.response_rejected"
            ? "模型调用不完整，已保留工作区并重试"
            : `${failed ? "失败" : event.type === "tool.started" ? "执行" : "完成"} · ${name}${path ? ` · ${path}` : ""}`;
        return { sequence: event.sequence, label, ...(event.type === "command.output" ? { output: safeText(event.payload.output).slice(0, 4000) } : {}) };
      }),
    });
  }

  const changedFiles = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "file.changed") continue;
    const path = safeText(event.payload.path);
    if (path) changedFiles.set(path, String(event.payload.revision ?? "?"));
  }
  if (changedFiles.size) {
    items.push({ kind: "files", id: "changed-files", files: [...changedFiles].map(([path, revision]) => ({ path, revision })) });
  }

  const validation = [...events].reverse().find((event) => event.type === "validation.completed");
  if (validation) {
    items.push({
      kind: "validation",
      id: `validation-${validation.sequence}`,
      passed: validation.payload.status === "PASSED",
      diagnosticCount: Number(validation.payload.diagnosticCount ?? 0),
    });
  }

  const diagnostics = events.filter((event) => event.type === "diagnostic.created").map((event) => {
    const diagnostic = event.payload.diagnostic && typeof event.payload.diagnostic === "object"
      ? event.payload.diagnostic as Record<string, unknown>
      : {};
    return {
      sequence: event.sequence,
      file: safeText(diagnostic.file) || null,
      message: safeText(diagnostic.message, "发现代码问题"),
      detail: [diagnostic.code, diagnostic.path, diagnostic.expected && `预期：${diagnostic.expected}`, diagnostic.actual && `实际：${diagnostic.actual}`, safeText(diagnostic.raw).slice(0, 4000)].filter(Boolean).join("\n"),
    };
  });
  if (diagnostics.length) items.push({ kind: "diagnostics", id: "diagnostics", diagnostics });

  if (terminalStatuses.has(run.status)) {
    const fallback: Record<string, string> = {
      NEEDS_INPUT: "请补充所需信息后继续。",
      NO_PROGRESS: "任务已停止，现有工作区可用于下一次定向修复。",
      CANCELLED: "任务已取消。",
      FAILED: "任务执行失败，请查看上方诊断。",
      COMMITTED: "代码已提交；Preview 状态请在右侧工作区查看。",
    };
    const tone = run.status === "COMMITTED" ? "success" : run.status === "FAILED" ? "error" : run.status === "NEEDS_INPUT" || run.status === "NO_PROGRESS" ? "warning" : "neutral";
    items.push({ kind: "result", id: "run-result", text: run.summary || fallback[run.status] || "任务已结束。", tone });
  }

  return items;
}
