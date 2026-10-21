export function workspaceRunLabel(status: string): string {
  const labels: Record<string, string> = {
    QUEUED: "等待执行",
    RUNNING: "正在修改和检查",
    READY_TO_VALIDATE: "检查通过，正在提交版本",
    NEEDS_INPUT: "等待你的回答",
    NO_PROGRESS: "未能继续修复",
    CANCELLED: "已取消，草稿已保留",
    FAILED: "任务失败，草稿已保留",
    COMMITTED: "代码已提交，预览结果请查看右侧",
  };
  return labels[status] ?? "状态待确认";
}

export function workspaceEventSection(type: string): "summary" | "details" {
  return ["tool.started", "tool.completed", "command.output"].includes(type) ? "details" : "summary";
}

export function workspacePreviewLabel(status: string): string {
  if (status === "SUCCEEDED") return "Preview 成功 · 打开";
  if (status === "FAILED") return "Preview 失败 · 查看错误";
  return "Preview 验证中";
}

export function workspaceEventLabel(event: { type: string; payload: Record<string, unknown> }): string | null {
  const payload = event.payload;
  const path = typeof payload.path === "string" ? payload.path : null;
  switch (event.type) {
    case "plan.updated": return typeof payload.summary === "string" ? `计划已更新：${payload.summary}` : "任务已排队";
    case "run.started": return "开始处理工作区";
    case "tool.started": return `正在执行 ${String(payload.name ?? "工具")}${path ? ` · ${path}` : ""}`;
    case "tool.completed": return payload.ok === false ? `工具失败：${String(payload.name ?? "工具")}${payload.error && typeof payload.error === "object" ? ` · ${String((payload.error as { message?: unknown }).message ?? "")}` : ""}` : null;
    case "model.response_rejected": return "模型调用不完整或暂时失败，正在从当前工作区重试";
    case "file.changed": return `已更新 ${path ?? "文件"} · 修订 ${String(payload.revision ?? "?")}`;
    case "validation.completed": return payload.status === "PASSED" ? "代码检查通过" : `代码检查发现 ${String(payload.diagnosticCount ?? "若干")} 项问题`;
    case "diagnostic.created": {
      const diagnostic = payload.diagnostic && typeof payload.diagnostic === "object" ? payload.diagnostic as { file?: unknown; message?: unknown } : null;
      return diagnostic ? `${String(diagnostic.file ?? "检查")}: ${String(diagnostic.message ?? "存在问题")}` : "发现代码问题";
    }
    case "question.asked": return `需要确认：${String(payload.question ?? "请补充需求")}`;
    case "artifact.committed": return "代码检查通过，版本已提交；Preview 将独立验证";
    case "run.cancelled": return "任务已取消，草稿保留";
    case "run.failed": return `任务失败：${String(payload.message ?? "请检查任务详情")}`;
    case "run.stopped": return "相同问题重复出现，已停止盲目重试";
    default: return null;
  }
}
