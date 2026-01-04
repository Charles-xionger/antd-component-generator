// app/api/share/[shareCode]/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";

// 获取分享的代码文件
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;

    if (!shareCode) {
      return Response.json({ error: "shareCode is required" }, { status: 400 });
    }

    // 查询分享记录
    const share = await prisma.share.findUnique({
      where: { shareCode },
      include: {
        artifactVersion: {
          include: {
            files: true,
          },
        },
      },
    });

    if (!share) {
      return Response.json({ error: "Share not found" }, { status: 404 });
    }

    // 返回文件数据
    return Response.json({
      success: true,
      version: {
        id: share.artifactVersion.id,
        versionNumber: share.artifactVersion.versionNumber,
        description: share.artifactVersion.description,
        createdAt: share.artifactVersion.createdAt,
        files: share.artifactVersion.files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch share:", error);
    return Response.json({ error: "Failed to fetch share" }, { status: 500 });
  }
}
