import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { getPublishedHostname } from "@/lib/projects/slug";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      deployments: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      thread: true,
      activeDeployment: {
        include: { artifactVersion: { select: { versionNumber: true } } },
      },
      deployments: {
        orderBy: { createdAt: "desc" },
        include: { artifactVersion: { select: { versionNumber: true } } },
      },
    },
  });

  return Response.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      url: `https://${getPublishedHostname(project.slug)}`,
      activeDeploymentId: project.activeDeploymentId,
      activeVersion: project.activeDeployment?.artifactVersion.versionNumber,
      deployments: project.deployments,
    })),
  });
}
