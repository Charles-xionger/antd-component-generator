// app/api/share/[shareCode]/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/database/prisma";
import { auth } from "@/lib/auth";

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

// 撤销分享：分享链接本身可匿名读取，但只有版本所属项目的所有者可以撤销。
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shareCode } = await params;
  const share = await prisma.share.findFirst({
    where: {
      shareCode,
      artifactVersion: {
        artifact: { project: { userId: session.user.id } },
      },
    },
    select: { id: true },
  });
  if (!share) {
    return Response.json({ error: "Share not found" }, { status: 404 });
  }

  await prisma.share.delete({ where: { id: share.id } });
  return Response.json({ success: true });
}
