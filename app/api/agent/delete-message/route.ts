export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createGraph } from "@/lib/agent";
import { auth } from "@/lib/auth";
import { getOwnedThread } from "@/lib/projects/ownership";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId, messageId } = await request.json();

    if (!threadId || !messageId) {
      return Response.json(
        { error: "threadId and messageId are required" },
        { status: 400 }
      );
    }

    // 验证该 thread 属于当前用户
    const thread = await getOwnedThread(threadId, session.user.id);

    if (!thread) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const graph = await createGraph();
    const config = {
      configurable: {
        thread_id: threadId,
        project_id: thread.projectId,
      },
    };

    // 获取当前状态
    const currentState = await graph.getState(config);

    if (!currentState.values.messages) {
      return Response.json({ error: "No messages found" }, { status: 404 });
    }

    // 前端传来的是 msg-0, msg-1, msg-2 这样的索引格式ID
    // 提取索引号
    const messageIndex = parseInt(messageId.replace("msg-", ""));

    if (
      isNaN(messageIndex) ||
      messageIndex < 0 ||
      messageIndex >= currentState.values.messages.length
    ) {
      console.error("[Delete Message] 无效的消息索引:", {
        messageId,
        messageIndex,
        totalMessages: currentState.values.messages.length,
      });
      return Response.json({ error: "Invalid message index" }, { status: 400 });
    }

    console.log("[Delete Message] 删除索引位置的消息:", {
      threadId,
      messageId,
      messageIndex,
      totalMessages: currentState.values.messages.length,
    });

    // 使用索引删除消息：创建一个不包含该索引消息的新数组
    const updatedMessages = currentState.values.messages.filter(
      (_msg: unknown, index: number) => index !== messageIndex
    );

    // 只修改会话状态。ArtifactVersion 是发布/回滚依据，保持不可变。

    // 更新状态（时间旅行）
    // 注意：添加特殊标记让 reducer 知道这是替换操作而不是追加
    // 创建一个带有 __replace__ 标记的消息数组
    const messagesWithReplaceMarker = [
      { __replace__: true } as unknown,
      ...updatedMessages,
    ];

    await graph.updateState(config, { messages: messagesWithReplaceMarker });

    return Response.json({
      success: true,
      deletedCount:
        currentState.values.messages.length - updatedMessages.length,
    });
  } catch (error) {
    console.error("Delete message error:", error);
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
