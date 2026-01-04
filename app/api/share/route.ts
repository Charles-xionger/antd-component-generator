// app/api/share/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";

// 创建分享
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { artifactVersionId } = body;

    if (!artifactVersionId) {
      return Response.json(
        { error: "artifactVersionId is required" },
        { status: 400 }
      );
    }

    // 验证版本是否存在
    const version = await prisma.artifactVersion.findUnique({
      where: { id: artifactVersionId },
    });

    if (!version) {
      return Response.json(
        { error: "ArtifactVersion not found" },
        { status: 404 }
      );
    }

    // 创建分享记录
    const share = await prisma.share.create({
      data: {
        artifactVersionId,
      },
    });

    return Response.json({
      success: true,
      shareCode: share.shareCode,
      shareUrl: `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/preview/${share.shareCode}`,
    });
  } catch (error) {
    console.error("Failed to create share:", error);
    return Response.json({ error: "Failed to create share" }, { status: 500 });
  }
}
