import { NextRequest } from "next/server";
import prisma from "@/lib/database/prisma";
import { createGraph } from "@/lib/agent";
import { BaseMessage } from "@langchain/core/messages";
import { auth } from "@/lib/auth";
import { getOwnedThread } from "@/lib/projects/ownership";

// 获取单个会话的消息历史和代码文件
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { threadId } = await params;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const ownedThread = await getOwnedThread(threadId, session.user.id);
    if (!ownedThread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    // 从 LangGraph checkpointer 获取消息历史
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    const graph = await createGraph();
    const state = await graph.getState(config);

    // 格式化消息，提取需要的字段
    // 使用索引作为消息ID，因为LangGraph消息的msg.id可能不稳定
    const messages =
      state.values?.messages?.map((msg: BaseMessage, index: number) => ({
        id: `msg-${index}`, // 使用索引作为ID
        type: msg._getType?.() || "unknown",
        content: msg.content,
        // 工具调用信息（如果有，用于 AI 消息）
        toolCalls:
          (msg as unknown as { tool_calls?: unknown[] }).tool_calls ||
          undefined,
        // 工具响应信息（如果有，用于 tool 消息）
        name: msg.name || undefined,
        // tool 消息关联的 tool_call_id
        tool_call_id:
          (msg as unknown as { tool_call_id?: string }).tool_call_id ||
          undefined,
      })) || [];

    // 获取 Thread 及其关联的 Artifact 和所有版本
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, userId: session.user.id },
      include: {
        project: {
          include: {
            artifact: {
              include: {
                versions: {
                  orderBy: { versionNumber: "desc" },
                  include: { files: true },
                },
              },
            },
          },
        },
      },
    });

    const allVersions = thread?.project.artifact?.versions || [];
    const currentVersion = allVersions[0]; // 最新版本
    const files = currentVersion?.files || [];

    return Response.json({
      messages,
      threadId,
      thread: thread
        ? {
            id: thread.id,
            title: thread.title,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
          }
        : null,
      projectId: thread?.projectId || null,
      artifact: thread?.project.artifact
        ? {
            id: thread.project.artifact.id,
            versions: allVersions.map((version) => ({
              id: version.id,
              versionNumber: version.versionNumber,
              description: version.description,
              createdAt: version.createdAt,
              files: version.files.map((file) => ({
                id: file.id,
                path: file.path,
                content: file.content,
              })),
            })),
            currentVersion: currentVersion
              ? {
                  id: currentVersion.id,
                  versionNumber: currentVersion.versionNumber,
                  description: currentVersion.description,
                  createdAt: currentVersion.createdAt,
                  files: files.map((file) => ({
                    id: file.id,
                    path: file.path,
                    content: file.content,
                  })),
                }
              : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to fetch thread data:", error);
    return Response.json(
      { error: "Failed to fetch thread data" },
      { status: 500 }
    );
  }
}

// 更新会话标题或触发 updatedAt 更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { threadId } = await params;
    const body = await request.json().catch(() => ({})); // 允许空 body
    const { title, favorite } = body;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const ownedThread = await getOwnedThread(threadId, session.user.id);
    if (!ownedThread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    // 构建更新数据：支持 title 和 favorite
    const updateData: { title?: string; favorite?: boolean; updatedAt: Date } =
      {
        updatedAt: new Date(),
      };

    if (title !== undefined) {
      updateData.title = title;
    }

    if (favorite !== undefined) {
      updateData.favorite = favorite;
    }

    const project = await prisma.project.update({
      where: { id: ownedThread.projectId },
      data: {
        ...(title !== undefined ? { name: title } : {}),
        thread: { update: updateData },
      },
      include: { thread: true },
    });

    return Response.json({ thread: project.thread, project });
  } catch (error) {
    console.error("Failed to update thread:", error);
    return Response.json({ error: "Failed to update thread" }, { status: 500 });
  }
}

// 删除会话
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { threadId } = await params;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const ownedThread = await getOwnedThread(threadId, session.user.id);
    if (!ownedThread) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (ownedThread.project.activeDeploymentId) {
        await tx.deployment.update({
          where: { id: ownedThread.project.activeDeploymentId },
          data: { status: "DISABLED" },
        });
      }
      await tx.project.update({
        where: { id: ownedThread.projectId },
        data: { status: "ARCHIVED", activeDeploymentId: null },
      });
    });

    return Response.json({
      success: true,
      message: "Thread deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete thread:", error);
    return Response.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}
