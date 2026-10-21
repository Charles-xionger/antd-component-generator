export type PublishCheckStatus = "ready" | "info" | "blocked";

export interface PublishCheck {
  label: string;
  detail: string;
  status: PublishCheckStatus;
}

interface PreviewState {
  status: string;
  errorMessage?: string | null;
}

export function getPublishChecks(input: {
  versionNumber: number | null;
  fileCount: number;
  fullstackPreview: PreviewState | null;
}): PublishCheck[] {
  const hasVersion = input.versionNumber !== null;
  const hasFiles = input.fileCount > 0;
  const previewFailed = input.fullstackPreview?.status === "FAILED";
  const previewPending =
    input.fullstackPreview &&
    !["SUCCEEDED", "FAILED"].includes(input.fullstackPreview.status);

  return [
    {
      label: "版本已生成",
      detail: hasVersion ? `将发布 v${input.versionNumber}` : "还没有可发布版本",
      status: hasVersion ? "ready" : "blocked",
    },
    {
      label: "文件已保存",
      detail: hasFiles ? `${input.fileCount} 个文件已准备` : "当前版本没有文件",
      status: hasFiles ? "ready" : "blocked",
    },
    {
      label: "发布构建",
      detail: previewFailed
        ? input.fullstackPreview?.errorMessage || "应用可用性检查未通过"
        : previewPending
          ? "可用版本仍在检查中"
          : input.fullstackPreview?.status === "SUCCEEDED"
            ? "应用已通过可用性检查"
            : "将在发布时完成构建与检查",
      status: previewFailed || previewPending ? "blocked" : "info",
    },
    {
      label: "公开访问",
      detail: "发布后，任何知道地址的人都可以访问",
      status: "info",
    },
  ];
}

export function getPublishProgress(status: string) {
  if (status === "ACTIVE") return { activeStep: 3, title: "发布完成" };
  if (status === "FAILED") return { activeStep: 1, title: "发布未完成" };
  return { activeStep: 1, title: "正在构建可发布版本" };
}

export interface DeploymentSummary {
  id: string;
  status: string;
  errorMessage?: string | null;
}

export function resolvePublishOutcome(
  deploymentId: string,
  deployments: DeploymentSummary[],
): { status: "pending" | "success" | "failed"; errorMessage?: string } {
  const deployment = deployments.find((item) => item.id === deploymentId);
  if (!deployment || deployment.status === "BUILDING") return { status: "pending" };
  if (deployment.status === "ACTIVE") return { status: "success" };
  if (deployment.status === "FAILED") {
    return {
      status: "failed",
      errorMessage: deployment.errorMessage || "发布检查未通过，请重试",
    };
  }
  return { status: "pending" };
}
