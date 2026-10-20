export type ActivityStatus = "pending" | "running" | "success" | "error";

interface ToolActivityInput {
  name: string;
  status: ActivityStatus;
}

interface PlanStepInput {
  stage: string;
  status: "pending" | "running" | "completed" | "failed";
}

const planStages = new Set(["architecture", "coding", "validating", "repairing"]);

function toolKind(name: string) {
  const normalized = name.toLowerCase();
  if (/(read|open|load|fetch).*file|file.*(read|open)/.test(normalized)) {
    return "read";
  }
  if (/(search|find|grep|glob|list)/.test(normalized)) return "search";
  if (/(test|check|lint|build|typecheck|command|shell|exec|run)/.test(normalized)) {
    return "check";
  }
  if (/(write|edit|patch|create|delete|move)/.test(normalized)) return "change";
  return "other";
}

function activityStatus(calls: ToolActivityInput[]): ActivityStatus {
  if (calls.some((call) => call.status === "error")) return "error";
  if (calls.some((call) => call.status === "running")) return "running";
  if (calls.some((call) => call.status === "pending")) return "pending";
  return "success";
}

export function summarizeToolActivity(calls: ToolActivityInput[]) {
  const counts = calls.reduce<Record<string, number>>((result, call) => {
    const kind = toolKind(call.name);
    result[kind] = (result[kind] || 0) + 1;
    return result;
  }, {});
  const segments = [
    counts.read ? `读取 ${counts.read} 个文件` : "",
    counts.search ? `搜索 ${counts.search} 次` : "",
    counts.check ? `运行 ${counts.check} 项检查` : "",
    counts.change ? `修改 ${counts.change} 个文件` : "",
    counts.other ? `调用 ${counts.other} 个工具` : "",
  ].filter(Boolean);

  return {
    label: segments.join(" · ") || "暂无工具活动",
    status: activityStatus(calls),
    total: calls.length,
  };
}

export function buildPlanSummary(steps: PlanStepInput[]) {
  const visible = steps.filter((step) => planStages.has(step.stage));
  const completed = visible.filter((step) => step.status === "completed").length;
  const status = visible.some((step) => step.status === "failed")
    ? "failed"
    : visible.some((step) => step.status === "running")
      ? "running"
      : completed === visible.length && visible.length > 0
        ? "completed"
        : "pending";

  return {
    completed,
    total: visible.length,
    label: `${completed}/${visible.length}`,
    status,
  };
}

export function buildResultSummary(versionNumber: number, fileCount: number) {
  return {
    title: `可用版本 v${versionNumber} 已准备`,
    description: `已生成并保存 ${fileCount} 个文件`,
  };
}
