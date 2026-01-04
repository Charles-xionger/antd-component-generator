export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { createGraph } from "@/lib/agent";
import prisma from "@/lib/database/prisma";
import { formatCodeContext } from "@/lib/agent/utils";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, images, threadId } = await request.json();

    if (!message && (!images || images.length === 0)) {
      return Response.json(
        { error: "Message or images are required" },
        { status: 400 }
      );
    }

    // 使用 threadId 作为会话标识，支持多轮对话
    const finalThreadId = threadId || crypto.randomUUID();
    const config = {
      configurable: {
        thread_id: finalThreadId,
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
        try {
          // 构建多模态消息内容（只包含用户输入，不注入 codeContext）
          // codeContext 通过 state.codeContext 传递给 agent，避免污染用户消息
          let messageContent:
            | string
            | Array<{
                type: string;
                text?: string;
                image_url?: { url: string };
                source_type?: string;
                data?: string;
                mime_type?: string;
              }> = message;

          if (images && images.length > 0) {
            const imageBlocks = [];

            // 只添加用户的文本消息
            imageBlocks.push({ type: "text", text: message });

            // images 是 {dataUrl, mime_type} 对象数组
            for (const img of images) {
              // 提取 base64 数据（剔除 data:image/xxx;base64, 前缀）
              const imageData = (
                img as { dataUrl: string; mime_type: string }
              ).dataUrl.replace(/^data:image\/\w+;base64,/, "");
              const mimeType = (img as { dataUrl: string; mime_type: string })
                .mime_type;

              imageBlocks.push({
                type: "image",
                source_type: "base64",
                data: imageData,
                mime_type: mimeType,
              });
            }

            messageContent = imageBlocks;
          }

          const inputMessage = new HumanMessage({ content: messageContent });

          // 使用 streamEvents 获取流式响应
          // codeContext 通过 state 传递，在 nodes.ts 的 SystemMessage 中注入
          const eventStream = graph.streamEvents(
            {
              messages: [inputMessage],
              codeContext: codeContext ? codeContext.trim() : "",
            },
            { ...config, version: "v2" }
          );

          // 追踪 ARCHITECT 是否已完成
          let hasArchitectCompleted = false;
          let accumulatedContent = ""; // 累积内容用于检测标签闭合

          for await (const event of eventStream) {
            // 流式发送 AI 消息内容
            if (
              event.event === "on_chat_model_stream" &&
              event.data?.chunk?.content
            ) {
              const content = event.data.chunk.content;

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
                  eventName === node
              );

              // 额外的内容特征检测（只过滤纯内部逻辑）
              const isInternalContent =
                // Supervisor 路由决策
                content.includes("{") && content.includes('"next"');

              if (isFilteredNode || isInternalContent) {
                console.log("[过滤] 内部流程消息:", {
                  node: eventName || "unknown",
                  contentPreview: content.substring(0, 50),
                });
                continue;
              }

              // 注意：Architect 消息已经用 <architectPlan> 标签包裹
              // 不再需要过滤，前端会优雅地渲染为卡片

              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  content,
                  threadId: finalThreadId,
                })}\n\n`
              );
              controller.enqueue(chunk);

              // 累积内容用于检测标签闭合
              accumulatedContent += content;

              // 检测 ARCHITECT 是否完成（标签闭合）
              // 注意：先发送内容，再检测闭合，确保前端能收到完整的 ARCHITECT 内容
              if (
                !hasArchitectCompleted &&
                accumulatedContent.includes("</architectPlan>")
              ) {
                hasArchitectCompleted = true;
                console.log("[Stream] ✅ ARCHITECT 完成检测:", {
                  累积内容长度: accumulatedContent.length,
                  包含闭合标签: accumulatedContent.includes("</architectPlan>"),
                  当前chunk: content.substring(0, 50),
                });

                // 发送 ARCHITECT 完成事件
                const architectCompleteChunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "architect_complete",
                    threadId: finalThreadId,
                  })}\n\n`
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
                })}\n\n`
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
                })}\n\n`
              );
              controller.enqueue(chunk);
            }
          }

          // ==========================================
          // 5. 流式响应结束
          // ==========================================
          // 注意：artifact 解析和保存已移到前端处理
          // 前端会在流式完成后调用 /api/artifact/save

          // 发送结束信号
          const endChunk = encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              threadId: finalThreadId,
            })}\n\n`
          );
          controller.enqueue(endChunk);
        } catch (error) {
          console.error("Stream error:", error);
          const errorChunk = encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`
          );
          controller.enqueue(errorChunk);
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
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
