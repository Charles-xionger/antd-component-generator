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
            // 处理 agent 节点开始
            if (event.event === "on_chain_start" && event.name) {
              const agentName = event.name.toLowerCase();
              // 只发送我们关心的 agent 节点（排除 subgraph，只关注实际的 agent）
              if (["architect", "coder", "reviewer"].includes(agentName)) {
                const chunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "agent_start",
                    agent: agentName,
                    message: getAgentStartMessage(agentName),
                    threadId: finalThreadId,
                  })}\n\n`
                );
                controller.enqueue(chunk);
              }
            }

            // 处理 agent 节点结束
            if (event.event === "on_chain_end" && event.name) {
              const agentName = event.name.toLowerCase();
              if (["architect", "coder", "reviewer"].includes(agentName)) {
                const chunk = encoder.encode(
                  `data: ${JSON.stringify({
                    type: "agent_end",
                    agent: agentName,
                    message: getAgentEndMessage(agentName),
                    threadId: finalThreadId,
                  })}\n\n`
                );
                controller.enqueue(chunk);
              }
            }

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

            // 处理工具调用开始
            if (event.event === "on_tool_start") {
              const toolName = event.name;
              const runId = event.run_id;
              const toolInput = event.data?.input || {};
              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_start",
                  tool_call_id: runId,
                  tool_name: toolName,
                  tool: toolName,
                  args: toolInput,
                  threadId: finalThreadId,
                })}\n\n`
              );
              controller.enqueue(chunk);
            }

            // 处理工具调用结束
            if (event.event === "on_tool_end") {
              const toolName = event.name;
              const runId = event.run_id;
              const output = event.data?.output;
              const chunk = encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_end",
                  tool_call_id: runId,
                  tool: toolName,
                  result:
                    typeof output === "string"
                      ? output
                      : JSON.stringify(output),
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

                  // 重新查询最新版本号，避免并发问题
                  const latestVersion = await prisma.artifactVersion.findFirst({
                    where: { artifactId: artifact.id },
                    orderBy: { versionNumber: "desc" },
                    select: { versionNumber: true },
                  });
                  const nextVersionNumber =
                    (latestVersion?.versionNumber || 0) + 1;

                  const newVersion = await prisma.artifactVersion.create({
                    data: {
                      artifactId: artifact.id,
                      versionNumber: nextVersionNumber,
                      description: `更新于 ${new Date().toLocaleString()}`,
                      files: {
                        create: nextFiles,
                      },
                    },
                  });
                  console.log(
                    "Created new version:",
                    newVersion.id,
                    "versionNumber:",
                    nextVersionNumber
                  );
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

// 获取 agent 开始时的友好消息
function getAgentStartMessage(agent: string): string {
  switch (agent) {
    case "architect":
      return "🏗️ 架构师正在设计方案...";
    case "coder":
      return "💻 工程师正在编写代码...";
    case "reviewer":
      return "🔍 审查员正在检查代码...";
    default:
      return "处理中...";
  }
}

// 获取 agent 结束时的友好消息
function getAgentEndMessage(agent: string): string {
  switch (agent) {
    case "architect":
      return "✅ 方案设计完成";
    case "coder":
      return "✅ 代码编写完成";
    case "reviewer":
      return "✅ 代码审查完成";
    default:
      return "完成";
  }
}
