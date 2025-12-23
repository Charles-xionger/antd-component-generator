import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";
import { createGraphForMcpUrl } from "@/lib/agent";
import { BaseMessage } from "@langchain/core/messages";

// 获取单个会话的消息历史
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    // 从 LangGraph checkpointer 获取消息历史
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    const graph = await createGraphForMcpUrl();
    const state = await (graph as any).getState(config);

    if (!state.values || !state.values.messages) {
      return Response.json({ messages: [] });
    }

    // 格式化消息，提取需要的字段
    const messages = state.values.messages.map((msg: BaseMessage) => ({
      id: msg.id,
      type: msg._getType?.() || "unknown",
      content: msg.content,
      // 工具调用信息（如果有）
      toolCalls:
        (msg as unknown as { tool_calls?: unknown[] }).tool_calls || undefined,
      // 工具响应信息（如果有）
      name: msg.name || undefined,
    }));

    return Response.json({ messages, threadId });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return Response.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

// 删除会话
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    // 从 Prisma 删除 thread 记录
    await prisma.thread.delete({
      where: { id: threadId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete thread:", error);
    return Response.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}

// 更新会话标题
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const { title } = await request.json();

    if (!threadId) {
      return Response.json({ error: "Thread ID is required" }, { status: 400 });
    }

    const thread = await prisma.thread.update({
      where: { id: threadId },
      data: { title },
    });

    return Response.json({ thread });
  } catch (error) {
    console.error("Failed to update thread:", error);
    return Response.json({ error: "Failed to update thread" }, { status: 500 });
  }
}
