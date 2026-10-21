import prisma from "@/lib/database/prisma";
import { getPublishedHostname } from "@/lib/projects/slug";
import {
  createDeploymentStatusService,
  type DeploymentStatusRepository,
} from "./deployment-status";

const prismaDeploymentStatusRepository: DeploymentStatusRepository = {
  findOwnedDeployment(deploymentId, userId) {
    return prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        project: { userId, status: "ACTIVE" },
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        runtimeType: true,
        endpoint: true,
        errorMessage: true,
        createdAt: true,
        activatedAt: true,
        artifactVersion: { select: { versionNumber: true } },
        project: {
          select: {
            name: true,
            slug: true,
            activeDeploymentId: true,
          },
        },
        buildJobs: {
          where: { type: "PUBLISH" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            log: true,
            errorMessage: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });
  },
};

export const deploymentStatusService = createDeploymentStatusService(
  prismaDeploymentStatusRepository,
  { publishedHostname: getPublishedHostname },
);
