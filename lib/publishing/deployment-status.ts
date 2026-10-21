import {
  classifyPublicationError,
  getPublicationProgress,
  parsePublicationLog,
  sanitizePublicationText,
  type JobPublicationActivity,
  type PublicationErrorResolution,
  type PublicationProgress,
  type PublicationStage,
} from "./deployment-events";

interface DeploymentBuildJobRecord {
  id: string;
  status: string;
  log: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface OwnedDeploymentRecord {
  id: string;
  projectId: string;
  status: string;
  runtimeType: string;
  endpoint: string | null;
  errorMessage: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  artifactVersion: { versionNumber: number };
  project: {
    name: string;
    slug: string;
    activeDeploymentId: string | null;
  };
  buildJobs: DeploymentBuildJobRecord[];
}

export interface DeploymentStatusRepository {
  findOwnedDeployment(deploymentId: string, userId: string): Promise<OwnedDeploymentRecord | null>;
}

export interface DeploymentStatusSnapshot {
  deploymentId: string;
  projectId: string;
  projectName: string;
  versionNumber: number;
  runtimeType: string;
  state: "running" | "success" | "failed";
  progress: PublicationProgress;
  publishedUrl: string;
  endpoint: string | null;
  previousVersionAvailable: boolean;
  jobId: string | null;
  activities: JobPublicationActivity[];
  lastSequence: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: (PublicationErrorResolution & {
    stage: PublicationStage;
    stageLabel: string;
    technicalMessage: string;
  }) | null;
  terminal: boolean;
}

function deploymentWorkerStatus(record: OwnedDeploymentRecord, job: DeploymentBuildJobRecord | undefined) {
  if (job) return job.status;
  if (record.status === "ACTIVE") return "SUCCEEDED";
  if (record.status === "FAILED") return "FAILED";
  return "QUEUED";
}

export function createDeploymentStatusService(
  repository: DeploymentStatusRepository,
  options: { publishedHostname: (slug: string) => string },
) {
  return {
    async getOwnedSnapshot(deploymentId: string, userId: string): Promise<DeploymentStatusSnapshot | null> {
      const deployment = await repository.findOwnedDeployment(deploymentId, userId);
      if (!deployment) return null;
      const job = deployment.buildJobs[0];
      const workerStatus = deploymentWorkerStatus(deployment, job);
      const progress = getPublicationProgress(workerStatus);
      const activities = job
        ? parsePublicationLog(job.log).map((event) => ({
            ...event,
            jobId: job.id,
          }))
        : [];
      const errorMessage = job?.errorMessage || deployment.errorMessage;
      const failedStage = activities.at(-1)?.stage ?? progress.stage;
      const failedStageLabel = {
        preparing: "准备",
        building: "构建",
        uploading: "上传",
        starting: "启动",
        verifying: "验证",
        switching: "切换流量",
      }[failedStage];
      const error = errorMessage
        ? {
            ...classifyPublicationError(errorMessage),
            stage: failedStage,
            stageLabel: failedStageLabel,
            technicalMessage: sanitizePublicationText(errorMessage),
          }
        : null;

      return {
        deploymentId: deployment.id,
        projectId: deployment.projectId,
        projectName: deployment.project.name,
        versionNumber: deployment.artifactVersion.versionNumber,
        runtimeType: deployment.runtimeType,
        state: progress.outcome,
        progress,
        publishedUrl: `https://${options.publishedHostname(deployment.project.slug)}`,
        endpoint: deployment.endpoint,
        previousVersionAvailable: Boolean(
          deployment.project.activeDeploymentId
          && deployment.project.activeDeploymentId !== deployment.id,
        ),
        jobId: job?.id ?? null,
        activities,
        lastSequence: activities.at(-1)?.sequence ?? 0,
        createdAt: deployment.createdAt.toISOString(),
        startedAt: job?.startedAt?.toISOString() ?? null,
        completedAt: job?.completedAt?.toISOString()
          ?? deployment.activatedAt?.toISOString()
          ?? null,
        error,
        terminal: progress.outcome !== "running",
      };
    },
  };
}
