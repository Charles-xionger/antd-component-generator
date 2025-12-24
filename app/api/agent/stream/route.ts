export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { createGraphForMcpUrl } from "@/lib/agent";
import prisma from "@/lib/database/pirsma";
import {
  formatCodeContext,
  parseXmlToMap,
  mergeFiles,
} from "@/lib/agent/utils";

export async function POST(request: NextRequest) {
  try {
    const { message, threadId } = await request.json();

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
    // 3. 创建 Graph 并注入上下文
    // ==========================================

    // 创建图 (暂时禁用 MCP 功能)
    const graph = await createGraphForMcpUrl(codeContext);

    // 创建可读流
    const encoder = new TextEncoder();
    let finalArtifact = ""; // 收集完整的生成内容

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
              finalArtifact += content; // 累积内容

              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  content,
                  threadId: finalThreadId,
                })}\n\n`
              );
              controller.enqueue(chunk);
            }

            // 处理工具调用
            if (event.event === "on_tool_start") {
              const toolName = event.name;
              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_start",
                  tool: toolName,
                  threadId: finalThreadId,
                })}\n\n`
              );
              controller.enqueue(chunk);
            }

            if (event.event === "on_tool_end") {
              const toolName = event.name;
              const output = event.data.output;
              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_end",
                  tool: toolName,
                  output,
                  threadId: finalThreadId,
                })}\n\n`
              );
              controller.enqueue(chunk);
            }
          }

          // ==========================================
          // 4. 后处理：保存新版本 (Post-computation)
          // ==========================================

          // 检查是否有生成的代码需要保存
          if (finalArtifact.includes("<boltArtifact")) {
            try {
              const generatedFilesMap = parseXmlToMap(finalArtifact);

              if (generatedFilesMap.size > 0) {
                console.log(
                  "Parsed files:",
                  Array.from(generatedFilesMap.keys())
                );

                if (!artifact) {
                  // 创建新的 Artifact 和第一个版本
                  const newArtifact = await prisma.artifact.create({
                    data: {
                      threadId: finalThreadId,
                      versions: {
                        create: {
                          versionNumber: 1,
                          description: "初始版本",
                          files: {
                            create: Array.from(generatedFilesMap.entries()).map(
                              ([path, content]) => ({
                                path,
                                content,
                              })
                            ),
                          },
                        },
                      },
                    },
                  });
                  console.log("Created new artifact:", newArtifact.id);
                } else {
                  // 合并逻辑：旧文件 + 新修改 = 新快照
                  const nextFiles = mergeFiles(currentFiles, generatedFilesMap);

                  const newVersion = await prisma.artifactVersion.create({
                    data: {
                      artifactId: artifact.id,
                      versionNumber: (currentVersion?.versionNumber || 0) + 1,
                      description: `更新于 ${new Date().toLocaleString()}`,
                      files: {
                        create: nextFiles,
                      },
                    },
                  });
                  console.log("Created new version:", newVersion.id);
                }

                // 发送保存完成信号
                const saveChunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "saved",
                    message: "代码已保存",
                    threadId: finalThreadId,
                  })}\n\n`
                );
                controller.enqueue(saveChunk);
              }
            } catch (saveError) {
              console.error("Failed to save artifact:", saveError);
              const errorChunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: "保存代码时出错",
                  threadId: finalThreadId,
                })}\n\n`
              );
              controller.enqueue(errorChunk);
            }
          }

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
