import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";

// 获取所有会话列表
export async function GET() {
  try {
    const threads = await prisma.thread.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        artifact: {
          include: {
            _count: {
              select: {
                versions: true,
              },
            },
          },
        },
      },
    });

    return Response.json({ threads });
  } catch (error) {
    console.error("Failed to fetch threads:", error);
    return Response.json({ error: "Failed to fetch threads" }, { status: 500 });
  }
}

// 创建新会话
export async function POST(request: NextRequest) {
  try {
    const { title } = await request.json();

    const thread = await prisma.thread.create({
      data: {
        title: title || "新会话",
      },
    });

    return Response.json({ thread });
  } catch (error) {
    console.error("Failed to create thread:", error);
    return Response.json({ error: "Failed to create thread" }, { status: 500 });
  }
}
