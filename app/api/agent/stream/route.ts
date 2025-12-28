export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { createGraphForMcpUrl } from "@/lib/agent";
import prisma from "@/lib/database/pirsma";
import { formatCodeContext } from "@/lib/agent/utils";

export async function POST(request: NextRequest) {
  try {
    const { message, threadId, mcpConfigId } = await request.json();

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
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
      thread = await prisma.thread.create({
        data: {
          id: finalThreadId,
          title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
        },
      });
    }

    // ==========================================
    // 3. 获取 MCP 配置（如果提供了 mcpConfigId）
    // ==========================================

    let mcpUrl: string | undefined;
    if (mcpConfigId) {
      const mcpConfig = await prisma.mCPConfig.findUnique({
        where: { id: mcpConfigId, enabled: true },
      });
      if (mcpConfig) {
        mcpUrl = mcpConfig.url;
        console.log("使用 MCP 配置:", mcpConfig.name, mcpUrl);
      }
    }

    // ==========================================
    // 4. 创建 Graph 并注入上下文
    // ==========================================

    // 创建图（支持 MCP 功能）
    const graph = await createGraphForMcpUrl(codeContext, mcpUrl);

    // 创建可读流
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 使用 streamEvents 获取流式响应
          const eventStream = graph.streamEvents(
            { messages: [new HumanMessage(message)] },
            { ...config, version: "v2" }
          );

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
