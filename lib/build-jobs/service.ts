import prisma from "@/lib/database/prisma";
import {
  appendPublicationActivity,
  limitPublicationLog,
  type NewPublicationActivity,
} from "@/lib/publishing/deployment-events";

const MAX_LOG_LENGTH = 64_000;

export async function queueFullstackPreview(projectId: string, artifactVersionId: string) {
  const existing = await prisma.buildJob.findFirst({
    where: { projectId, artifactVersionId, type: "FULLSTACK_PREVIEW", status: { in: ["QUEUED", "BUILDING", "MIGRATING", "TESTING", "STARTING", "VERIFYING", "SUCCEEDED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.buildJob.create({
    data: { projectId, artifactVersionId, type: "FULLSTACK_PREVIEW" },
  });
}

export async function appendBuildLog(jobId: string, line: string) {
  const current = await prisma.buildJob.findUnique({ where: { id: jobId }, select: { log: true } });
  const next = `${current?.log || ""}${line}\n`.slice(-MAX_LOG_LENGTH);
  return prisma.buildJob.update({ where: { id: jobId }, data: { log: next } });
}

export async function appendBuildActivity(
  jobId: string,
  activity: Omit<NewPublicationActivity, "timestamp"> & { timestamp?: string },
) {
  const current = await prisma.buildJob.findUnique({
    where: { id: jobId },
    select: { log: true },
  });
  const appended = appendPublicationActivity(current?.log, {
    ...activity,
    timestamp: activity.timestamp || new Date().toISOString(),
  });
  const bounded = limitPublicationLog(appended.log, MAX_LOG_LENGTH);
  await prisma.buildJob.update({ where: { id: jobId }, data: { log: bounded } });
  return appended.event;
}

export async function getLatestPreview(projectId: string, artifactVersionId?: string) {
  return prisma.buildJob.findFirst({
    where: { projectId, type: "FULLSTACK_PREVIEW", ...(artifactVersionId ? { artifactVersionId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, artifactVersionId: true, status: true, previewUrl: true, errorMessage: true, log: true, createdAt: true, completedAt: true },
  });
}
