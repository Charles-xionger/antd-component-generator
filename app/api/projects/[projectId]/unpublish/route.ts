import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { getOwnedProject } from "@/lib/projects/ownership";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await params;
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    if (project.activeDeploymentId) {
      await tx.deployment.update({
        where: { id: project.activeDeploymentId },
        data: { status: "DISABLED" },
      });
    }
    await tx.project.update({
      where: { id: projectId },
      data: { activeDeploymentId: null },
    });
  });
  return Response.json({ success: true });
}
