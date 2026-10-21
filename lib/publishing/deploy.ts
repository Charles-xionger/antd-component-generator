import prisma from "@/lib/database/prisma";
import { buildPublishedApp } from "./builder";
import { deploymentStorage } from "./storage";

export async function publishDeployment(
  deploymentId: string,
  projectId: string,
  files: { path: string; content: string }[],
) {
  const temporaryPath = await deploymentStorage.createTemporaryPath(
    projectId,
    deploymentId,
  );

  try {
    await buildPublishedApp(files, temporaryPath);
    const buildPath = await deploymentStorage.commit(
      projectId,
      deploymentId,
      temporaryPath,
    );

    return prisma.$transaction(async (tx) => {
      await tx.deployment.updateMany({
        where: { projectId, status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      const deployment = await tx.deployment.update({
        where: { id: deploymentId },
        data: { status: "ACTIVE", buildPath, activatedAt: new Date() },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { activeDeploymentId: deploymentId },
      });
      return deployment;
    });
  } catch (error) {
    await deploymentStorage.cleanup(temporaryPath);
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "构建失败",
      },
    });
    throw error;
  }
}
