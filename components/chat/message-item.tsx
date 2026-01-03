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
  const { artifact, isArchitectMessage, isCodingMessage } = useMessageParser(
    message.content,
    isUser,
    previousArtifact
  );

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

  // AI 消息 - Architect 规划
  if (isArchitectMessage) {
    // 提取 architectPlan 内容
    const planMatch = message.content.match(
      /<architectPlan>([\s\S]*?)<\/architectPlan>/
    );
    const planContent = planMatch ? planMatch[1].trim() : message.content;

    // 检查是否还在生成中（没有闭合标签）
    const isStreaming =
      message.content.includes("<architectPlan") &&
      !message.content.includes("</architectPlan>");

    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%]">
          <ThinkingCard
            content={planContent}
            duration={isStreaming ? "规划中" : "规划完成"}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    );
  }

  // AI 消息 - 普通聊天回复（非代码生成）
  if (!isCodingMessage) {
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

  // AI 消息 - 代码生成相关
  // 修复：只要是 coding 消息，就应该显示代码生成卡片，即使 artifact 还未完全解析
  if (isCodingMessage) {
    // 检查是否还在流式生成中
    const isStreaming =
      message.content.includes("<boltArtifact") &&
      !message.content.includes("</boltArtifact>");

    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] space-y-3">
          {/* 代码生成卡片 */}
          <CodeGenerationCard artifact={artifact} isStreaming={isStreaming} />
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
