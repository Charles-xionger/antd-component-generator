export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import prisma from "@/lib/database/prisma";

interface FileData {
  path: string;
  content: string;
}

interface SaveArtifactRequest {
  threadId: string;
  files: FileData[];
}

export async function POST(request: NextRequest) {
  try {
    const {
      threadId,
      files,
      versionNumber,
    }: SaveArtifactRequest & { versionNumber?: number } = await request.json();

    if (!threadId || !files || files.length === 0) {
      return Response.json(
        { error: "threadId and files are required" },
        { status: 400 }
      );
    }

    console.log("[Artifact Save] 收到保存请求:", {
      threadId,
      filesCount: files.length,
      versionNumber,
    });

    // ==========================================
    // 智能持久化：
    // 1. 如果提供了 versionNumber，检查是否已存在（Coder 已创建）
    // 2. 如果已存在，更新文件内容
    // 3. 如果不存在，创建新版本
    // ==========================================

    // 查找该 thread 下的 artifact
    const artifact = await prisma.artifact.findUnique({
      where: { threadId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: versionNumber ? 10 : 1, // 如果指定版本号，多查几个
          include: { files: true },
        },
      },
    });

    const currentVersion = artifact?.versions[0];
    const currentFiles = currentVersion?.files || [];

    // 检查指定的版本是否已存在
    let existingVersion = null;
    if (versionNumber && artifact) {
      existingVersion = artifact.versions.find(
        (v) => v.versionNumber === versionNumber
      );

      if (existingVersion) {
        console.log(
          `[Artifact Save] 版本 ${versionNumber} 已存在（Coder 已创建），跳过保存`
        );
        return Response.json({
          success: true,
          artifactId: artifact.id,
          versionId: existingVersion.id,
          versionNumber: existingVersion.versionNumber,
          message: "Version already exists (created by Coder)",
          skipped: true,
        });
      }
    }

    if (!artifact) {
      // 创建新的 Artifact 和第一个版本
      const newArtifact = await prisma.artifact.create({
        data: {
          threadId,
          versions: {
            create: {
              versionNumber: 1,
              description: "初始版本",
              files: {
                create: files.map((file) => ({
                  path: file.path,
                  content: file.content,
                })),
              },
            },
          },
        },
        include: {
          versions: {
            include: { files: true },
          },
        },
      });

      console.log("[Artifact Save] Created new artifact:", newArtifact.id);

      return Response.json({
        success: true,
        artifactId: newArtifact.id,
        versionNumber: 1,
        message: "Artifact created successfully",
      });
    } else {
      // 合并逻辑：旧文件 + 新文件 = 新快照
      const currentFilesMap = new Map(
        currentFiles.map((f) => [f.path, f.content])
      );

      // 用新文件覆盖旧文件
      files.forEach((file) => {
        currentFilesMap.set(file.path, file.content);
      });

      const mergedFiles = Array.from(currentFilesMap.entries()).map(
        ([path, content]) => ({
          path,
          content,
        })
      );

      // 重新查询最新版本号，避免并发问题
      const latestVersion = await prisma.artifactVersion.findFirst({
        where: { artifactId: artifact.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

      const newVersion = await prisma.artifactVersion.create({
        data: {
          artifactId: artifact.id,
          versionNumber: nextVersionNumber,
          description: `更新于 ${new Date().toLocaleString()}`,
          files: {
            create: mergedFiles,
          },
        },
        include: {
          files: true,
        },
      });

      console.log(
        "[Artifact Save] Created new version:",
        newVersion.id,
        "versionNumber:",
        nextVersionNumber
      );

      return Response.json({
        success: true,
        artifactId: artifact.id,
        versionId: newVersion.id,
        versionNumber: nextVersionNumber,
        message: "Artifact updated successfully",
      });
    }
  } catch (error) {
    console.error("[Artifact Save] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
