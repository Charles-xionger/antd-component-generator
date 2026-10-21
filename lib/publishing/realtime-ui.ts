export const RELEASE_STAGES = ["准备", "构建", "上传", "启动", "验证", "切换流量"] as const;

export interface ActivityStreamState {
  following: boolean;
  unreadCount: number;
  eventKeys: string[];
}

type ActivityStreamAction =
  | { type: "pause" }
  | { type: "follow" }
  | { type: "replace"; eventKeys: string[] }
  | { type: "append"; eventKeys: string[] };

export function activityStreamReducer(
  state: ActivityStreamState,
  action: ActivityStreamAction,
): ActivityStreamState {
  if (action.type === "pause") return { ...state, following: false };
  if (action.type === "follow") return { ...state, following: true, unreadCount: 0 };
  if (action.type === "replace") {
    return {
      following: state.following,
      unreadCount: 0,
      eventKeys: [...new Set(action.eventKeys)],
    };
  }
  const known = new Set(state.eventKeys);
  const added: string[] = [];
  for (const key of action.eventKeys) {
    if (known.has(key)) continue;
    known.add(key);
    added.push(key);
  }
  return {
    ...state,
    unreadCount: state.following ? 0 : state.unreadCount + added.length,
    eventKeys: [...state.eventKeys, ...added],
  };
}

export type ProjectReleaseState = "online" | "publishing" | "attention" | "offline";

export function getProjectReleaseState(input: {
  activeDeploymentId?: string | null;
  latestStatus?: string | null;
}): ProjectReleaseState {
  if (input.latestStatus === "BUILDING") return "publishing";
  if (input.latestStatus === "FAILED") return "attention";
  if (input.activeDeploymentId) return "online";
  return "offline";
}

export function deploymentStatusPath(deploymentId: string) {
  return `/deployments/${encodeURIComponent(deploymentId)}`;
}

export function releaseConfirmationCopy(kind: "rollback" | "unpublish") {
  if (kind === "rollback") {
    return {
      title: "确认回滚到这个版本？",
      description:
        "稳定 URL 不变，数据与新版本都会保留。完成前当前版本继续在线；回滚完成后可随时再次发布。",
      confirmLabel: "确认回滚",
    };
  }
  return {
    title: "确认下线这个应用？",
    description:
      "公开地址将停止访问，但项目数据和版本都会保留。之后可以重新发布恢复访问。",
    confirmLabel: "确认下线",
  };
}
