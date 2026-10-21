import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { getOwnedProject } from "@/lib/projects/ownership";
import { getPublishedHostname } from "@/lib/projects/slug";

interface Context {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await params;
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({
    project: {
      ...project,
      publishedUrl: project.activeDeployment
        ? `https://${getPublishedHostname(project.slug)}`
        : null,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await params;
  const owned = await getOwnedProject(projectId, session.user.id);
  if (!owned) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined;
  const favorite =
    typeof body.favorite === "boolean" ? body.favorite : undefined;
  if (name !== undefined && !name) {
    return Response.json({ error: "Project name is required" }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name ? { name } : {}),
      ...(name || favorite !== undefined
        ? {
            thread: {
              update: {
                ...(name ? { title: name } : {}),
                ...(favorite !== undefined ? { favorite } : {}),
              },
            },
          }
        : {}),
    },
    include: { thread: true },
  });
  return Response.json({ project });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await params;
  const owned = await getOwnedProject(projectId, session.user.id);
  if (!owned) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    if (owned.activeDeploymentId) {
      await tx.deployment.update({
        where: { id: owned.activeDeploymentId },
        data: { status: "DISABLED" },
      });
    }
    await tx.project.update({
      where: { id: projectId },
      data: { status: "ARCHIVED", activeDeploymentId: null },
    });
  });
  return Response.json({ success: true });
}
