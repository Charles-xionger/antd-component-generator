// components/chat/message-item.tsx
"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Streamdown } from "streamdown";
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

  // 将 base64 data URL 转换为 Blob URL（优化性能）
  const imageBlobUrls = useMemo(() => {
    if (!message.images || message.images.length === 0) return [];

    return message.images.map((img) => {
      // 将 data URL 转换为 Blob
      const base64Data = img.dataUrl.split(",")[1];
      const mimeType = img.dataUrl.match(/data:([^;]+);/)?.[1] || "image/png";
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      return URL.createObjectURL(blob);
    });
  }, [message.images]);

  // 清理 Blob URL
  useMemo(() => {
    return () => {
      imageBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageBlobUrls]);

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
    architectPlanContent,
  } = useMessageParser(message.content, isUser, previousArtifact);

  // AI 消息内容为空时，不渲染（流式响应刚开始的占位消息）
  if (!isUser && !message.content.trim()) {
    return null;
  }

  // console.log("[MessageItem] 渲染消息:", {
  //   id: message.id,
  //   contentLength: message.content.length,
  //   isArchitectMessage,
  //   isCodingMessage,
  //   hasArchitectTag: message.content.includes("<architectPlan"),
  //   hasCodingTag: message.content.includes("<boltArtifact"),
  // });

  // 用户消息
  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-2">
        {/* 图片气泡（在上） */}
        {message.images && message.images.length > 0 && (
          <div className="max-w-[85%]">
            <div className="rounded-lg bg-primary/90 p-2 space-y-2">
              {message.images.map((img, index) => (
                <div
                  key={index}
                  className="bg-white/10 rounded-md overflow-hidden relative"
                  style={{ minHeight: "100px" }}
                >
                  <Image
                    src={imageBlobUrls[index]}
                    alt={`上传的图片 ${index + 1}`}
                    width={400}
                    height={300}
                    className="w-full h-auto"
                    style={{ maxHeight: "300px", objectFit: "contain" }}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 文本气泡（在下） */}
        {message.content && (
          <div className="max-w-[85%]">
            <div className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
              <Streamdown className="prose prose-sm max-w-none">
                {message.content}
              </Streamdown>
            </div>
          </div>
        )}
      </div>
    );
  }

  // AI 消息 - 同时包含 Architect 和 Coding（完整流程）
  if (isArchitectMessage && isCodingMessage) {
    // 使用更严格的闭合标签检测，确保状态正确更新
    const architectStreaming =
      message.content.includes("<architectPlan") &&
      !message.content.includes("</architectPlan>");
    const codingStreaming =
      message.content.includes("<boltArtifact") &&
      !message.content.includes("</boltArtifact>");

    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] space-y-3">
          {/* Architect 开场白 */}
          {architectOpeningText && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown
                className="prose prose-sm max-w-none text-sm"
                isAnimating={architectStreaming}
              >
                {architectOpeningText}
              </Streamdown>
            </div>
          )}

          {/* Architect 规划卡片 */}
          {message.content.includes("<architectPlan") && (
            <ThinkingCard
              content={architectPlanContent || ""}
              duration={architectStreaming ? "规划中" : "规划完成"}
              isStreaming={architectStreaming}
            />
          )}

          {/* Architect 结束语 */}
          {architectClosingText && !architectStreaming && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown className="prose prose-sm max-w-none text-sm">
                {architectClosingText}
              </Streamdown>
            </div>
          )}

          {/* Coding 开场白 */}
          {openingText && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown
                className="prose prose-sm max-w-none text-sm"
                isAnimating={codingStreaming}
              >
                {openingText}
              </Streamdown>
            </div>
          )}

          {/* 代码生成卡片 */}
          {message.content.includes("<boltArtifact") && (
            <CodeGenerationCard
              artifact={artifact}
              isStreaming={codingStreaming}
            />
          )}

          {/* Coding 结束语 */}
          {closingText && !codingStreaming && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown className="prose prose-sm max-w-none text-sm">
                {closingText}
              </Streamdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息 - 仅代码生成（没有 architect）
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
              <Streamdown
                className="prose prose-sm max-w-none text-sm"
                isAnimating={isStreaming}
              >
                {openingText}
              </Streamdown>
            </div>
          )}

          {/* 代码生成卡片 - 只在有标签时显示 */}
          {message.content.includes("<boltArtifact") && (
            <CodeGenerationCard artifact={artifact} isStreaming={isStreaming} />
          )}

          {/* 结束语 */}
          {closingText && !isStreaming && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown className="prose prose-sm max-w-none text-sm">
                {closingText}
              </Streamdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI 消息 - 仅 Architect 规划（没有代码生成）
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
              <Streamdown className="prose prose-sm max-w-none">
                {message.content}
              </Streamdown>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] space-y-3">
          {/* 开场白 */}
          {architectOpeningText && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown
                className="prose prose-sm max-w-none text-sm"
                isAnimating={isStreaming}
              >
                {architectOpeningText}
              </Streamdown>
            </div>
          )}

          {/* 规划方案卡片 - 使用解析好的内容，流式时即使为空也显示 */}
          <ThinkingCard
            content={architectPlanContent || ""}
            duration={isStreaming ? "规划中" : "规划完成"}
            isStreaming={isStreaming}
          />

          {/* 结束语 */}
          {architectClosingText && !isStreaming && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown className="prose prose-sm max-w-none text-sm">
                {architectClosingText}
              </Streamdown>
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
            <Streamdown className="prose prose-sm max-w-none">
              {message.content}
            </Streamdown>
          </div>
        </div>
      </div>
    );
  }

  // AI 消息 - 兜底（不应该到这里，如果到了说明有逻辑问题）
  // 为了安全，使用 cleanContent 清理 XML 标签
  console.warn("[MessageItem] 进入兜底分支，消息ID:", message.id);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
          <Streamdown className="prose prose-sm max-w-none">
            {message.content}
          </Streamdown>
        </div>
      </div>
    </div>
  );
}
