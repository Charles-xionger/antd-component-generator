import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { getOwnedProject } from "@/lib/projects/ownership";
import { getPublishedHostname } from "@/lib/projects/slug";
import { publishDeployment } from "@/lib/publishing/deploy";

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

  const deployments = await prisma.deployment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { artifactVersion: { select: { versionNumber: true } } },
  });
  return Response.json({
    deployments,
    activeDeploymentId: project.activeDeploymentId,
    publishedUrl: project.activeDeployment
      ? `https://${getPublishedHostname(project.slug)}`
      : null,
  });
}

export async function POST(request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await params;
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project?.artifact) {
    return Response.json({ error: "Project has no generated code" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedVersionId =
    typeof body.artifactVersionId === "string"
      ? body.artifactVersionId
      : undefined;
  const version = requestedVersionId
    ? await prisma.artifactVersion.findFirst({
        where: { id: requestedVersionId, artifactId: project.artifact.id },
        include: { files: true },
      })
    : await prisma.artifactVersion.findFirst({
        where: { artifactId: project.artifact.id },
        orderBy: { versionNumber: "desc" },
        include: { files: true },
      });

  if (!version) {
    return Response.json({ error: "Artifact version not found" }, { status: 404 });
  }

  const deployment = await prisma.deployment.create({
    data: { projectId, artifactVersionId: version.id, status: "BUILDING" },
  });
  try {
    const active = await publishDeployment(
      deployment.id,
      projectId,
      version.files,
    );
    return Response.json(
      {
        deployment: active,
        publishedUrl: `https://${getPublishedHostname(project.slug)}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Publish failed",
        deploymentId: deployment.id,
      },
      { status: 422 },
    );
  }
}
