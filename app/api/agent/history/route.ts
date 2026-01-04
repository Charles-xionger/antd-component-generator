import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";
import { auth } from "@/lib/auth";

// 获取所有会话列表
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const threads = await prisma.thread.findMany({
      where: {
        userId: session.user.id,
      },
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
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title } = await request.json();

    const thread = await prisma.thread.create({
      data: {
        title: title || "新会话",
        userId: session.user.id,
      },
    });

    return Response.json({ thread });
  } catch (error) {
    console.error("Failed to create thread:", error);
    return Response.json({ error: "Failed to create thread" }, { status: 500 });
  }
}
