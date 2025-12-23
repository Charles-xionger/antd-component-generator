export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { createGraphForMcpUrl } from "@/lib/agent";
import prisma from "@/lib/database/pirsma";

export async function POST(request: NextRequest) {
  try {
    const { message, threadId, mcpConfigId } = await request.json();

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // 使用 threadId 作为会话标识，支持多轮对话
    const config = {
      configurable: {
        thread_id: threadId || crypto.randomUUID(),
      },
    };

    // 如果前端传入 mcpConfigId，则尝试读取配置并创建对应的 graph
    let graph = await createGraphForMcpUrl();
    if (mcpConfigId) {
      try {
        const mcp = await prisma.mCPConfig.findUnique({
          where: { id: mcpConfigId },
        });
        if (mcp?.url) {
          graph = await createGraphForMcpUrl(mcp.url);
        }
      } catch (err) {
        console.error("Failed to load MCP config:", err);
      }
    }

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
            // 处理 LLM 流式输出
            if (
              event.event === "on_chat_model_stream" &&
              event.data.chunk?.content
            ) {
              const content = event.data.chunk.content;
              if (typeof content === "string" && content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                );
              }
            }
          }

          // 发送结束信号
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
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
