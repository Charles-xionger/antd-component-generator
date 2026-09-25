import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { getOwnedProject } from "@/lib/projects/ownership";
import { getPublishedHostname } from "@/lib/projects/slug";

export async function POST(
  _request: Request,
  {
    params,
  }: { params: Promise<{ projectId: string; deploymentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId, deploymentId } = await params;
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const deployment = await prisma.deployment.findFirst({
    where: {
      id: deploymentId,
      projectId,
      buildPath: { not: null },
      status: { in: ["ACTIVE", "SUPERSEDED", "DISABLED"] },
    },
  });
  if (!deployment) {
    return Response.json({ error: "Deployment not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.deployment.updateMany({
      where: { projectId, status: "ACTIVE", id: { not: deploymentId } },
      data: { status: "SUPERSEDED" },
    });
    await tx.deployment.update({
      where: { id: deploymentId },
      data: { status: "ACTIVE", activatedAt: new Date() },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { activeDeploymentId: deploymentId },
    });
  });

  return Response.json({
    success: true,
    publishedUrl: `https://${getPublishedHostname(project.slug)}`,
  });
}
