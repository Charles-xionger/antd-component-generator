import { NextRequest } from "next/server";
import prisma from "@/lib/database/prisma";
import { auth } from "@/lib/auth";
import { createProjectIdentity } from "@/lib/projects/slug";

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
        project: {
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
        },
      },
    });

    return Response.json({
      threads: threads.map((thread) => ({
        ...thread,
        artifact: thread.project.artifact,
      })),
    });
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

    const name =
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, 80)
        : "新项目";
    const identity = createProjectIdentity(name);
    const project = await prisma.project.create({
      data: {
        ...identity,
        name,
        userId: session.user.id,
        thread: {
          create: {
            title: name,
            userId: session.user.id,
          },
        },
      },
      include: { thread: true },
    });

    return Response.json({ thread: project.thread, project });
  } catch (error) {
    console.error("Failed to create thread:", error);
    return Response.json({ error: "Failed to create thread" }, { status: 500 });
  }
}
