/* eslint-disable @typescript-eslint/no-explicit-any */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createGraph } from "@/lib/agent";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";

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
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
    });

    if (!thread || thread.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
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

    // 删除该消息之后的所有消息和对应的 artifact 版本
    const messagesToDelete = currentState.values.messages.slice(
      messageIndex + 1
    );

    console.log("[Regenerate] 准备删除版本:", {
      threadId,
      messageIndex,
      messagesToDeleteCount: messagesToDelete.length,
    });

    // 删除 artifact 版本
    const versionNumbersToDelete: number[] = [];
    for (const msg of messagesToDelete) {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text || "").join("")
          : "";

      console.log("[Regenerate] 检查消息:", {
        msgType: msg.type,
        contentLength: content.length,
        hasBoltArtifact: content.includes("<boltArtifact"),
        contentPreview: content.substring(0, 200),
      });

      if (content.includes("<boltArtifact")) {
        const versionMatch = content.match(/version="(\d+)"/);
        console.log("[Regenerate] 版本匹配结果:", {
          versionMatch,
          extractedVersion: versionMatch ? versionMatch[1] : null,
        });

        if (versionMatch) {
          const versionNumber = parseInt(versionMatch[1], 10);
          versionNumbersToDelete.push(versionNumber);
          console.log(`[Regenerate] 找到版本号: ${versionNumber}`);
        }
      }
    }

    console.log("[Regenerate] 收集到的版本号:", versionNumbersToDelete);

    // 如果有需要删除的版本，批量删除
    if (versionNumbersToDelete.length > 0) {
      try {
        const minVersion = Math.min(...versionNumbersToDelete);
        const artifact = await prisma.artifact.findUnique({
          where: { threadId },
        });

        console.log("[Regenerate] 查找 artifact:", {
          threadId,
          artifactFound: !!artifact,
          artifactId: artifact?.id,
        });

        if (artifact) {
          // 删除版本号 >= minVersion 的所有版本
          const result = await prisma.artifactVersion.deleteMany({
            where: {
              artifactId: artifact.id,
              versionNumber: { gte: minVersion },
            },
          });
          console.log(
            `[Regenerate] ✅ 删除 artifact 版本 >= ${minVersion}，共删除 ${result.count} 个版本`
          );
        } else {
          console.warn(
            `[Regenerate] ⚠️ 未找到 threadId=${threadId} 的 artifact`
          );
        }
      } catch (error) {
        console.error("[Regenerate] ❌ 删除 artifact 版本失败:", error);
      }
    } else {
      console.log("[Regenerate] ⚠️ 没有找到需要删除的版本号");
    }

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
