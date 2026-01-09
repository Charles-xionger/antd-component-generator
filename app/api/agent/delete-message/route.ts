export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { createGraph } from "@/lib/agent";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/prisma";

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

    // 删除该消息及之后所有消息对应的 artifact 版本
    // 获取需要删除的消息范围
    const messagesToDelete = currentState.values.messages.slice(messageIndex);

    console.log("[Delete Message] 准备删除版本:", {
      threadId,
      messageIndex,
      messagesToDeleteCount: messagesToDelete.length,
    });

    // 提取这些消息中的 artifact 版本号
    const versionNumbersToDelete: number[] = [];
    for (const msg of messagesToDelete) {
      // 检查消息内容中是否有 boltArtifact
      const content =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text || "").join("")
          : "";

      console.log("[Delete Message] 检查消息:", {
        msgType: msg.type,
        contentLength: content.length,
        hasBoltArtifact: content.includes("<boltArtifact"),
        contentPreview: content.substring(0, 200),
      });

      if (content.includes("<boltArtifact")) {
        // 尝试提取 version 属性 (versionNumber)
        const versionMatch = content.match(/version="(\d+)"/);
        console.log("[Delete Message] 版本匹配结果:", {
          versionMatch,
          extractedVersion: versionMatch ? versionMatch[1] : null,
        });

        if (versionMatch) {
          const versionNumber = parseInt(versionMatch[1], 10);
          versionNumbersToDelete.push(versionNumber);
          console.log(`[Delete Message] 找到版本号: ${versionNumber}`);
        }
      }
    }

    console.log("[Delete Message] 收集到的版本号:", versionNumbersToDelete);

    // 🔥 暂时注释掉版本删除功能，待优化后再启用
    // 如果有需要删除的版本，批量删除
    // if (versionNumbersToDelete.length > 0) {
    //   try {
    //     const minVersion = Math.min(...versionNumbersToDelete);
    //     const artifact = await prisma.artifact.findUnique({
    //       where: { threadId },
    //     });

    //     console.log("[Delete Message] 查找 artifact:", {
    //       threadId,
    //       artifactFound: !!artifact,
    //       artifactId: artifact?.id,
    //     });

    //     if (artifact) {
    //       // 删除版本号 >= minVersion 的所有版本
    //       const result = await prisma.artifactVersion.deleteMany({
    //         where: {
    //           artifactId: artifact.id,
    //           versionNumber: { gte: minVersion },
    //         },
    //       });
    //       console.log(
    //         `[Delete Message] ✅ 删除 artifact 版本 >= ${minVersion}，共删除 ${result.count} 个版本`
    //       );
    //     } else {
    //       console.warn(
    //         `[Delete Message] ⚠️ 未找到 threadId=${threadId} 的 artifact`
    //       );
    //     }
    //   } catch (error) {
    //     console.error("[Delete Message] ❌ 删除 artifact 版本失败:", error);
    //   }
    // } else {
    //   console.log("[Delete Message] ⚠️ 没有找到需要删除的版本号");
    // }

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
