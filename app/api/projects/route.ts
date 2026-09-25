import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { createProjectIdentity, getPublishedHostname } from "@/lib/projects/slug";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      thread: true,
      artifact: { select: { _count: { select: { versions: true } } } },
      activeDeployment: {
        include: { artifactVersion: { select: { versionNumber: true } } },
      },
      deployments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, createdAt: true },
      },
    },
  });

  return Response.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      slug: project.slug,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      thread: project.thread,
      versionCount: project.artifact?._count.versions || 0,
      activeDeployment: project.activeDeployment
        ? {
            id: project.activeDeployment.id,
            versionNumber: project.activeDeployment.artifactVersion.versionNumber,
            activatedAt: project.activeDeployment.activatedAt,
            url: `https://${getPublishedHostname(project.slug)}`,
          }
        : null,
      latestDeploymentStatus: project.deployments[0]?.status || null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "新项目";
  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 500) || null
      : null;
  const identity = createProjectIdentity(name);

  const project = await prisma.project.create({
    data: {
      ...identity,
      name,
      description,
      userId: session.user.id,
      thread: {
        create: {
          title: name,
          userId: session.user.id,
        },
      },
    },
    include: { thread: true },
  });

  return Response.json({ project }, { status: 201 });
}
