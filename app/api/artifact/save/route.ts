export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getOwnedProject, getOwnedThread } from "@/lib/projects/ownership";
import { saveProjectArtifactVersion } from "@/lib/projects/artifact-service";

interface FileData {
  path: string;
  content: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const files = body.files as FileData[] | undefined;
  if (!Array.isArray(files) || files.length === 0) {
    return Response.json({ error: "files are required" }, { status: 400 });
  }

  let projectId = body.projectId as string | undefined;
  if (!projectId && body.threadId) {
    const thread = await getOwnedThread(body.threadId, session.user.id);
    projectId = thread?.projectId;
  }
  if (!projectId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const project = await getOwnedProject(projectId, session.user.id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const version = await saveProjectArtifactVersion({
      projectId,
      files,
      generationRequestId:
        typeof body.generationRequestId === "string"
          ? body.generationRequestId
          : undefined,
      description: "手动保存",
    });
    return Response.json({
      success: true,
      artifactId: version.artifactId,
      versionId: version.id,
      versionNumber: version.versionNumber,
    });
  } catch (error) {
    console.error("[Artifact Save] Error:", error);
    return Response.json({ error: "Failed to save artifact" }, { status: 500 });
  }
}
