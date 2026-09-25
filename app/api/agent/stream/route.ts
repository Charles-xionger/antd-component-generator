// Vercel 执行时间限制：
// - Hobby 计划：10 秒
// - Pro 计划：60 秒（默认），可配置到 300 秒
// - Enterprise 计划：900 秒
// 如果使用 Pro 计划，可以在 vercel.json 中配置 route 的 maxDuration
import { STREAM_CONFIG } from "@/lib/agent/config";

// Next.js requires route segment config values to be statically analyzable literals.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { createGraph } from "@/lib/agent";
import prisma from "@/lib/database/prisma";
import { formatCodeContext } from "@/lib/agent/utils";
import { auth } from "@/lib/auth";
import { generateThreadTitle } from "@/lib/agent/models";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, images, threadId, model } = await request.json();

    if (!message && (!images || images.length === 0)) {
      return Response.json(
        { error: "Message or images are required" },
        { status: 400 },
      );
    }

    // 使用 threadId 作为会话标识，支持多轮对话
    const finalThreadId = threadId || crypto.randomUUID();
    const config = {
      configurable: {
        thread_id: finalThreadId,
        model: model || "qwen3.7-flash-2026-07-15", // 传递模型参数到 graph
      },
    };

    // ==========================================
    // 1. 获取上下文 (Pre-computation)
    // ==========================================

    // 尝试查找该 thread 下的最新代码快照
    const artifact = await prisma.artifact.findUnique({
      where: { threadId: finalThreadId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" }, // 取最新版本
          take: 1,
          include: { files: true },
        },
      },
    });

    const currentVersion = artifact?.versions[0];
    const currentFiles = currentVersion?.files || [];

    // 格式化当前代码为上下文字符串
    const codeContext = formatCodeContext(currentFiles);

    // ==========================================
    // 2. 获取或创建 Thread 记录
    // ==========================================

    let thread = await prisma.thread.findUnique({
      where: { id: finalThreadId },
    });

    if (!thread) {
      // 确保 message 是字符串后再截取
      const messageText =
        typeof message === "string"
          ? message
          : Array.isArray(message)
            ? message.find((m) => m.type === "text")?.text || "New Chat"
            : "New Chat";

      thread = await prisma.thread.create({
        data: {
          id: finalThreadId,
          title:
            messageText.slice(0, 50) + (messageText.length > 50 ? "..." : ""),
          userId: session.user.id,
        },
      });
    }

    // ==========================================
    // 3. 创建 Graph
    // ==========================================

    // 创建图
    const graph = await createGraph();

    // 创建可读流
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let heartbeatInterval: NodeJS.Timeout | undefined;
        let isClosed = false; // 追踪流是否已关闭

        try {
          // 构建多模态消息内容（只包含用户输入）
          // codeContext 通过 state.codeContext 传递，agent 会从消息历史中获取代码上下文
          let messageContent:
            | string
            | Array<{
                type: string;
                text?: string;
                source_type?: string;
                data?: string;
                mime_type?: string;
              }> = message;

          if (images && images.length > 0) {
            const imageBlocks: Array<{
              type: string;
              text?: string;
              source_type?: string;
              data?: string;
              mime_type?: string;
            }> = [];

            // 添加用户的文本消息
            if (message) {
              imageBlocks.push({ type: "text", text: message });
            }

            // images 是 {dataUrl, mime_type} 对象数组
            // LangGraph 要求图片格式：type: "image", source_type: "base64", data: base64字符串, mime_type: MIME类型
            for (const img of images) {
              const imgData = img as { dataUrl: string; mime_type: string };

              // 从 data URL 中提取纯 base64 数据（移除 "data:image/png;base64," 前缀）
              const base64Data = imgData.dataUrl.includes(",")
                ? imgData.dataUrl.split(",")[1]
                : imgData.dataUrl;

              imageBlocks.push({
                type: "image",
                source_type: "base64",
                data: base64Data,
                mime_type: imgData.mime_type, // 添加 MIME 类型
              });
            }

            messageContent = imageBlocks;

            console.log("[Stream API] 图片消息已构建:", {
              imageCount: images.length,
              hasText: !!message,
              firstImagePreview: images[0]?.dataUrl?.substring(0, 50) + "...",
              mimeType: images[0]?.mime_type,
            });
          }

          const inputMessage = new HumanMessage({ content: messageContent });

          // 使用 streamEvents 获取流式响应
          // codeContext 通过 state 传递，agent 通过消息历史获取代码上下文，不在 prompt 中重复注入
          const eventStream = graph.streamEvents(
            {
              messages: [inputMessage],
              codeContext: codeContext ? codeContext.trim() : "",
            },
            { ...config, version: "v2" },
          );

          // 追踪 ARCHITECT 是否已完成
          let hasArchitectCompleted = false;
          let accumulatedContent = ""; // 累积内容用于检测标签闭合
          let aiResponseContent = ""; // 累积AI回复用于生成标题
          let finalAiContent = ""; // 非流式模型/提供商的最终响应兜底
          let lastHeartbeat = Date.now(); // 心跳时间戳

          // 心跳机制：防止连接超时
          // 始终启用心跳机制，确保长时间生成不中断
          let heartbeatFailCount = 0;
          const MAX_HEARTBEAT_FAILS = 3; // 连续失败3次才关闭

          heartbeatInterval = setInterval(() => {
            if (isClosed) return; // 如果已关闭，直接返回

            const now = Date.now();
            // 如果超过阈值时间没有发送数据，发送心跳
            if (now - lastHeartbeat > STREAM_CONFIG.HEARTBEAT_THRESHOLD) {
              try {
                const heartbeatChunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "heartbeat",
                    timestamp: now,
                  })}\n\n`,
                );
                controller.enqueue(heartbeatChunk);
                lastHeartbeat = now;
                heartbeatFailCount = 0; // 成功后重置失败计数
              } catch (error) {
                heartbeatFailCount++;
                console.error(
                  `[心跳] ✗ 发送失败 (${heartbeatFailCount}/${MAX_HEARTBEAT_FAILS}):`,
                  error,
                );

                // 只有连续失败多次才关闭流，避免误关
                if (heartbeatFailCount >= MAX_HEARTBEAT_FAILS) {
                  console.error("[心跳] ✗✗✗ 连续失败次数过多，关闭流");
                  isClosed = true;
                  if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = undefined;
                  }
                }
              }
            }
          }, STREAM_CONFIG.HEARTBEAT_INTERVAL);

          for await (const event of eventStream) {
            // 检查流是否已关闭，避免在已关闭的流上继续操作
            if (isClosed) {
              console.log("[Stream] 流已关闭，停止处理事件");
              break;
            }

            // 流式发送 AI 消息内容
            if (
              event.event === "on_chat_model_stream" &&
              event.data?.chunk?.content
            ) {
              const content = event.data.chunk.content;

              // 检查 finish_reason（用于诊断生成停止原因）
              const finishReason =
                event.data?.chunk?.response_metadata?.finish_reason;
              if (finishReason === "length") {
                console.warn(`[Stream] ⚠️ 模型因达到长度限制而停止`, {
                  累积长度: accumulatedContent.length,
                });
              }

              // 智能过滤：基于事件元数据和内容特征
              // 定义需要过滤的节点（只过滤纯内部逻辑，不过滤有用户价值的消息）
              const FILTERED_NODES = [
                "routeToSubgraph", // Supervisor 路由决策（纯内部逻辑）
                // 注意：不过滤 architect，让前端智能渲染为架构规划卡片
              ];

              // 检查事件来源（通过 tags 或 name 判断）
              const eventTags = event.tags || [];
              const eventName = event.name || "";
              const isFilteredNode = FILTERED_NODES.some(
                (node) =>
                  eventTags.includes(node) ||
                  eventName.includes(node) ||
                  eventName === node,
              );

              // 额外的内容特征检测（只过滤纯内部逻辑）
              const isInternalContent =
                // Supervisor 路由决策
                content.includes("{") && content.includes('"next"');

              if (isFilteredNode || isInternalContent) {
                continue;
              }

              // 注意：Architect 消息已经用 <architectPlan> 标签包裹
              // 不再需要过滤，前端会优雅地渲染为卡片

              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  content,
                  threadId: finalThreadId,
                })}\n\n`,
              );

              try {
                controller.enqueue(chunk);
                lastHeartbeat = Date.now(); // 更新心跳时间戳
              } catch (enqueueError) {
                console.error("[Stream] ✗ 发送内容失败:", enqueueError);
                console.error(
                  "[Stream] 当前累积长度:",
                  accumulatedContent.length,
                );
                console.error("[Stream] 内容预览:", content.substring(0, 100));
                throw enqueueError; // 重新抛出，让外层 catch 处理
              }

              // 累积内容用于检测标签闭合和生成标题
              accumulatedContent += content;
              aiResponseContent += content;

              // 检测 ARCHITECT 是否完成（标签闭合）
              // 注意：先发送内容，再检测闭合，确保前端能收到完整的 ARCHITECT 内容
              if (
                !hasArchitectCompleted &&
                accumulatedContent.includes("</architectPlan>")
              ) {
                hasArchitectCompleted = true;

                // 发送 ARCHITECT 完成事件
                const architectCompleteChunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "architect_complete",
                    threadId: finalThreadId,
                  })}\n\n`,
                );
                controller.enqueue(architectCompleteChunk);
              }
            }

            // 监听 architect 节点完成事件（更可靠的完成信号）
            // 但要注意：只有在确实有 architectPlan 内容时才发送完成事件
            // 闲聊场景下不应该发送 architect_complete，避免前端误判
            if (
              event.event === "on_chain_end" &&
              event.name === "architect" &&
              !hasArchitectCompleted
            ) {
              const outputMessages = event.data?.output?.messages;
              const finalMessage = Array.isArray(outputMessages)
                ? outputMessages[outputMessages.length - 1]
                : undefined;
              if (finalMessage?.content) {
                finalAiContent =
                  typeof finalMessage.content === "string"
                    ? finalMessage.content
                    : Array.isArray(finalMessage.content)
                      ? finalMessage.content
                          .map((block: { text?: string }) => block.text || "")
                          .join("")
                      : String(finalMessage.content);
              }

              // 检查是否包含架构规划标签
              // 只有真正的架构规划才发送 architect_complete 事件
              if (accumulatedContent.includes("<architectPlan>")) {
                hasArchitectCompleted = true;

                // 发送 ARCHITECT 完成事件
                const architectCompleteChunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "architect_complete",
                    threadId: finalThreadId,
                  })}\n\n`,
                );
                controller.enqueue(architectCompleteChunk);
              }
            }

            // 处理工具调用开始
            if (event.event === "on_tool_start") {
              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_start",
                  tool_call_id: event.run_id,
                  tool_name: event.name,
                  args: event.data?.input || {},
                  threadId: finalThreadId,
                })}\n\n`,
              );
              controller.enqueue(chunk);
            }

            // 处理工具调用结束
            if (event.event === "on_tool_end") {
              const output = event.data?.output;
              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_end",
                  tool_call_id: event.run_id,
                  tool_name: event.name,
                  result:
                    typeof output === "string"
                      ? output
                      : JSON.stringify(output),
                  threadId: finalThreadId,
                })}\n\n`,
              );
              controller.enqueue(chunk);
            }
          }

          // 某些 OpenAI 兼容服务不产生 on_chat_model_stream 事件，但会在
          // 节点结束时给出完整消息。此时仍把结果返回给前端，避免空白响应。
          if (!accumulatedContent && finalAiContent) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  content: finalAiContent,
                  threadId: finalThreadId,
                })}\n\n`,
              ),
            );
            accumulatedContent = finalAiContent;
            aiResponseContent = finalAiContent;
          }

          // ==========================================
          // 5. 流式响应结束
          // ==========================================
          console.log("[Stream] 流式响应结束", {
            长度: accumulatedContent.length,
            完整: accumulatedContent.includes("</boltArtifact>"),
          });

          // 检查内容完整性
          if (
            accumulatedContent.includes("<boltArtifact") &&
            !accumulatedContent.includes("</boltArtifact>")
          ) {
            console.warn(
              "[Stream] ⚠️ 警告：检测到未闭合的 <boltArtifact> 标签，尝试自动修复",
            );

            // 尝试找到最后一个 <boltAction> 的闭合位置
            const lastActionEndIndex =
              accumulatedContent.lastIndexOf("</boltAction>");
            if (lastActionEndIndex !== -1) {
              // 在最后一个 action 后面补充闭合标签
              const closeTag = "\n</boltArtifact>";
              const closeChunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  content: closeTag,
                  threadId: finalThreadId,
                })}\n\n`,
              );

              try {
                controller.enqueue(closeChunk);
                accumulatedContent += closeTag;
                aiResponseContent += closeTag;
                console.log("[Stream] ✓ 已自动补全 </boltArtifact> 闭合标签");
              } catch (error) {
                console.error("[Stream] ✗ 补全闭合标签失败:", error);
              }
            } else {
              console.error("[Stream] ✗ 无法找到合适的位置补全闭合标签");
              console.warn(
                "[Stream] 内容末尾:",
                accumulatedContent.slice(-200),
              );
            }
          }

          // 注意：artifact 解析和保存已移到前端处理
          // 前端会在流式完成后调用 /api/artifact/save

          // ==========================================
          // 6. 自动生成会话标题（如果是新会话）
          // ==========================================
          const shouldGenerateTitle =
            thread &&
            (thread.title === "新会话" ||
              thread.title === "New Chat" ||
              thread.title.endsWith("..."));

          if (shouldGenerateTitle && aiResponseContent) {
            try {
              // 提取用户消息文本
              const userMessageText =
                typeof message === "string"
                  ? message
                  : Array.isArray(message)
                    ? message.find((m) => m.type === "text")?.text || ""
                    : "";

              // 异步生成标题（不阻塞响应完成）
              const newTitle = await generateThreadTitle(
                userMessageText,
                aiResponseContent,
                model || "qwen3.7-flash-2026-07-15",
              );

              // 更新数据库中的标题
              await prisma.thread.update({
                where: { id: finalThreadId },
                data: { title: newTitle },
              });

              // 发送标题更新事件到前端
              const titleUpdateChunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "title_update",
                  threadId: finalThreadId,
                  title: newTitle,
                })}\n\n`,
              );
              controller.enqueue(titleUpdateChunk);
            } catch (error) {
              console.error("[标题生成] ❌ 生成标题失败:", error);
              // 标题生成失败不影响主流程，继续执行
            }
          }

          // 发送结束信号

          const endChunk = encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              threadId: finalThreadId,
            })}\n\n`,
          );
          controller.enqueue(endChunk);
        } catch (error) {
          console.error("[Stream] 流式响应错误:", error);
          console.error(
            "[Stream] 错误堆栈:",
            error instanceof Error ? error.stack : "无堆栈信息",
          );
          const errorChunk = encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
              details: error instanceof Error ? error.stack : undefined,
            })}\n\n`,
          );
          controller.enqueue(errorChunk);
        } finally {
          // 清理心跳定时器
          isClosed = true; // 标记为已关闭
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
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
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
