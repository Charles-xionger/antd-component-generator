// components/chat/message-item.tsx
"use client";

import type { Message } from "@/hooks/use-chat";
import type { Artifact } from "@/components/canvas";
import { ThinkingCard } from "./thinking-card";
import { CodeGenerationCard } from "./code-generation-card";
import {
  useMessageParser,
  parseArtifactFromContent,
} from "@/hooks/use-message-parser";

// 辅助函数：查找前一条 artifact 消息
function findPreviousArtifact(
  messages: Message[] | undefined,
  currentMessageId: string
): Artifact | null {
  if (!messages) return null;

  const currentIndex = messages.findIndex((m) => m.id === currentMessageId);
  if (currentIndex <= 0) return null;

  // 从当前消息往前查找最近的一条包含 artifact 的消息
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevMsg = messages[i];
    if (
      prevMsg.role === "assistant" &&
      prevMsg.content.includes("<boltArtifact")
    ) {
      return parseArtifactFromContent(prevMsg.content);
    }
  }
  return null;
}

interface MessageItemProps {
  message: Message;
  messages?: Message[]; // 用于查找历史 artifact
}

export function MessageItem({ message, messages }: MessageItemProps) {
  const isUser = message.role === "user";

  // 获取前一条消息的 artifact（用于乐观更新）
  const previousArtifact = isUser
    ? null
    : findPreviousArtifact(messages, message.id);

  // 使用 hook 解析消息内容，传入历史 artifact
  const {
    artifact,
    isArchitectMessage,
    isCodingMessage,
    openingText,
    closingText,
    architectOpeningText,
    architectClosingText,
  } = useMessageParser(message.content, isUser, previousArtifact);

  // AI 消息内容为空时，不渲染（流式响应刚开始的占位消息）
  if (!isUser && !message.content.trim()) {
    return null;
  }

  console.log("[MessageItem] 渲染消息:", {
    id: message.id,
    contentLength: message.content.length,
    isArchitectMessage,
    isCodingMessage,
    hasArchitectTag: message.content.includes("<architectPlan"),
    hasCodingTag: message.content.includes("<boltArtifact"),
  });

  // 用户消息
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            <div className="whitespace-pre-wrap wrap-break-word">
              {message.content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI 消息 - 代码生成优先（如果同时包含 architect 和 coding，优先显示代码）
  if (isCodingMessage || openingText) {
    // 检查是否还在流式生成中
    const isStreaming =
      message.content.includes("<boltArtifact") &&
      !message.content.includes("</boltArtifact>");

    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] space-y-3">
          {/* 开场白 - 即使没有 artifact 标签也显示 */}
          {openingText && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <div className="whitespace-pre-wrap text-sm">{openingText}</div>
            </div>
          )}

          {/* 代码生成卡片 - 只在有标签时显示 */}
          {message.content.includes("<boltArtifact") && (
            <CodeGenerationCard artifact={artifact} isStreaming={isStreaming} />
          )}

          {/* 结束语 */}
          {closingText && !isStreaming && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <div className="whitespace-pre-wrap text-sm">{closingText}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息 - Architect 规划（只在没有代码生成时显示）
  if (isArchitectMessage && !isCodingMessage) {
    // 检查是否还在生成中（没有闭合标签）
    const isStreaming =
      message.content.includes("<architectPlan") &&
      !message.content.includes("</architectPlan>");

    // 如果没有 <architectPlan> 标签，说明是纯对话（需求不清楚的情况）
    if (!message.content.includes("<architectPlan")) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%]">
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        </div>
      );
    }

    // 提取 architectPlan 内容
    const planMatch = message.content.match(
      /<architectPlan>([\s\S]*?)<\/architectPlan>/
    );
    const planContent = planMatch ? planMatch[1].trim() : "";

    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] space-y-3">
          {/* 开场白 */}
          {architectOpeningText && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <div className="whitespace-pre-wrap text-sm">
                {architectOpeningText}
              </div>
            </div>
          )}

          {/* 规划方案卡片 */}
          {planContent && (
            <ThinkingCard
              content={planContent}
              duration={isStreaming ? "规划中" : "规划完成"}
              isStreaming={isStreaming}
            />
          )}

          {/* 结束语 */}
          {architectClosingText && !isStreaming && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <div className="whitespace-pre-wrap text-sm">
                {architectClosingText}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息 - 普通聊天回复（非代码生成，非architect）
  if (!isCodingMessage && !isArchitectMessage) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  // AI 消息 - 普通聊天回复（兜底）
  if (!message.content) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    </div>
  );
}
