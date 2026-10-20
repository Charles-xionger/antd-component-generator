import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";
import { getOwnedProject } from "@/lib/projects/ownership";
import { getLatestPreview, queueFullstackPreview } from "@/lib/build-jobs/service";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const versionId = new URL(request.url).searchParams.get("artifactVersionId") || undefined;
  const preview = await getLatestPreview(projectId, versionId);
  return Response.json({ preview: preview ? { ...preview, log: preview.log?.slice(-16_000) } : null });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project?.artifact) return Response.json({ error: "Project has no artifact" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const version = await prisma.artifactVersion.findFirst({
    where: { artifactId: project.artifact.id, ...(typeof body.artifactVersionId === "string" ? { id: body.artifactVersionId } : {}) },
    orderBy: { versionNumber: "desc" },
  });
  if (!version?.appBlueprint || version.runtimeVersion !== "go-1.24") return Response.json({ error: "Artifact is not a Go application" }, { status: 422 });
  const failed = await prisma.buildJob.findMany({ where: { projectId, artifactVersionId: version.id, type: "FULLSTACK_PREVIEW", status: "FAILED" } });
  if (failed.length) await prisma.buildJob.deleteMany({ where: { id: { in: failed.map((job) => job.id) } } });
  const job = await queueFullstackPreview(projectId, version.id);
  return Response.json({ job }, { status: 202 });
}
