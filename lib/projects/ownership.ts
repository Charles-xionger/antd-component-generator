import prisma from "@/lib/database/prisma";

export async function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId, status: "ACTIVE" },
    include: {
      thread: true,
      artifact: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: { files: true },
          },
        },
      },
      activeDeployment: {
        include: { artifactVersion: true },
      },
    },
  });
}

export async function getOwnedThread(threadId: string, userId: string) {
  return prisma.thread.findFirst({
    where: { id: threadId, userId, project: { status: "ACTIVE" } },
    include: { project: true },
  });
}
