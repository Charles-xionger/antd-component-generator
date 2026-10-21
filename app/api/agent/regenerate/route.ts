export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createGraph } from "@/lib/agent";
import { auth } from "@/lib/auth";
import { getOwnedThread } from "@/lib/projects/ownership";

/**
 * 重新生成消息：从指定消息之后重新执行 LangGraph
 * 不会重新发送消息，而是从该消息的检查点状态继续执行
 */
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

    // 从消息 ID 中提取索引
    const match = messageId.match(/^msg-(\d+)$/);
    if (!match) {
      return Response.json({ error: "Invalid message ID" }, { status: 400 });
    }
    const messageIndex = parseInt(match[1], 10);

    const graph = await createGraph();
    const config = {
      configurable: {
        thread_id: threadId,
        project_id: thread.projectId,
        generation_request_id: crypto.randomUUID(),
      },
    };

    // 获取当前状态
    const currentState = await graph.getState(config);

    if (!currentState.values.messages) {
      return Response.json({ error: "No messages found" }, { status: 404 });
    }

    // 验证索引有效性
    if (
      messageIndex < 0 ||
      messageIndex >= currentState.values.messages.length
    ) {
      return Response.json({ error: "Invalid message index" }, { status: 400 });
    }

    // 验证目标消息是用户消息
    const targetMessage = currentState.values.messages[messageIndex];
    if (targetMessage.type !== "human") {
      return Response.json(
        { error: "Can only regenerate from user messages" },
        { status: 400 }
      );
    }

    // 消息状态可以回退，但 ArtifactVersion 是发布和回滚依据，必须保持不可变。
    const messagesToDelete = currentState.values.messages.slice(
      messageIndex + 1
    );

    console.log("[Regenerate] 准备删除版本:", {
      threadId,
      messageIndex,
      messagesToDeleteCount: messagesToDelete.length,
    });

    console.log("[Regenerate] 保留历史 ArtifactVersion:", {
      messagesBeingReplaced: messagesToDelete.length,
    });

    // 保留到目标消息为止的所有消息
    const updatedMessages = currentState.values.messages.slice(
      0,
      messageIndex + 1
    );

    // 更新状态，只保留到目标消息
    const messagesWithReplaceMarker = [
      { __replace__: true } as unknown,
      ...updatedMessages,
    ];

    await graph.updateState(config, { messages: messagesWithReplaceMarker });

    console.log("[Regenerate] 状态已更新，准备重新执行图:", {
      threadId,
      messageIndex,
      remainingMessages: updatedMessages.length,
      targetMessageType: targetMessage.type,
    });

    // 创建流式响应
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 🔥 修复：使用 streamEvents 并重新传入目标用户消息
          // LangGraph 的 reducer 会识别消息已存在（通过 id），不会重复添加
          // 这样会触发图重新执行 architect → coder 流程

          console.log("[Regenerate] 使用 streamEvents 触发重新执行");

          const eventStream = graph.streamEvents(
            {
              messages: [targetMessage],
              codeContext: "", // 重新生成时不需要旧代码上下文
            },
            {
              ...config,
              version: "v2",
            }
          );

          // 追踪状态
          let hasArchitectCompleted = false;
          let accumulatedContent = "";

          for await (const event of eventStream) {
            // 流式发送 AI 消息内容
            if (
              event.event === "on_chat_model_stream" &&
              event.data?.chunk?.content
            ) {
              const content = event.data.chunk.content;

              // 发送内容块
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "content",
                    content,
                  })}\n\n`
                )
              );

              // 累积内容用于检测标签闭合
              accumulatedContent += content;

              // 检测 ARCHITECT 是否完成
              if (
                !hasArchitectCompleted &&
                accumulatedContent.includes("</architectPlan>")
              ) {
                hasArchitectCompleted = true;
                console.log("[Regenerate] ✅ ARCHITECT 完成");

                // 发送 ARCHITECT 完成事件
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "architect_complete",
                    })}\n\n`
                  )
                );
              }
            }
          }

          // 发送完成信号
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "end",
                threadId,
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          console.error("[Regenerate] Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Regenerate] Error:", error);
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
