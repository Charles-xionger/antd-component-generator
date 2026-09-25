import prisma from "@/lib/database/prisma";

export interface ArtifactFileInput {
  path: string;
  content: string;
}

export async function saveProjectArtifactVersion(input: {
  projectId: string;
  files: ArtifactFileInput[];
  generationRequestId?: string;
  description?: string;
}) {
  const { projectId, files, generationRequestId, description } = input;

  if (generationRequestId) {
    const existing = await prisma.artifactVersion.findFirst({
      where: { generationRequestId, artifact: { projectId } },
      include: { files: true },
    });
    if (existing) return existing;
  }

  // 两个标签页可能同时从同一个最新版本生成。数据库唯一约束负责
  // 判定胜者，冲突的一方重新读取最新版本后再分配下一个版本号。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (generationRequestId) {
          const existing = await tx.artifactVersion.findFirst({
            where: { generationRequestId, artifact: { projectId } },
            include: { files: true },
          });
          if (existing) return existing;
        }

        let artifact = await tx.artifact.findUnique({
          where: { projectId },
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
              take: 1,
              include: { files: true },
            },
          },
        });

        if (!artifact) {
          artifact = await tx.artifact.create({
            data: { projectId },
            include: {
              versions: {
                orderBy: { versionNumber: "desc" },
                take: 1,
                include: { files: true },
              },
            },
          });
        }

        const previous = artifact.versions[0];
        const merged = new Map(
          (previous?.files || []).map((file) => [file.path, file.content]),
        );
        for (const file of files) merged.set(file.path, file.content);

        const versionNumber = (previous?.versionNumber || 0) + 1;
        return tx.artifactVersion.create({
          data: {
            artifactId: artifact.id,
            versionNumber,
            generationRequestId,
            description:
              description ||
              (versionNumber === 1 ? "初始版本" : `项目版本 ${versionNumber}`),
            files: {
              create: Array.from(merged, ([path, content]) => ({ path, content })),
            },
          },
          include: { files: true },
        });
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (code !== "P2002" || attempt === 2) throw error;

      if (generationRequestId) {
        const existing = await prisma.artifactVersion.findFirst({
          where: { generationRequestId, artifact: { projectId } },
          include: { files: true },
        });
        if (existing) return existing;
      }
    }
  }

  throw new Error("无法分配项目版本号");
}
