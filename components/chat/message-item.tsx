// components/chat/message-item.tsx
"use client";

import type { Message } from "@/hooks/use-chat";
import { CanvasCard } from "@/components/canvas-card";
import type { Artifact } from "@/components/canvas/types";
import { ToolCallCard } from "./tool-call-card";

interface MessageItemProps {
  message: Message;
  artifact?: Artifact | null;
  onCanvasExpand?: () => void;
}

export function MessageItem({
  message,
  artifact,
  onCanvasExpand,
}: MessageItemProps) {
  const isUser = message.role === "user";

  // 从消息内容中移除 artifact XML 标签
  const displayContent = message.content
    .replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/g, "")
    .trim();

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {/* 消息气泡 */}
        {displayContent && (
          <div
            className={`rounded-lg px-4 py-2 ${
              isUser
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            }`}
          >
            <div className="whitespace-pre-wrap wrap-break-word">
              {displayContent}
            </div>
          </div>
        )}

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Canvas Card (豆包风格：卡片嵌入消息流) */}
        {!isUser && message.hasArtifact && artifact && (
          <div className="mt-3">
            <CanvasCard
              artifact={artifact}
              onExpand={onCanvasExpand || (() => {})}
            />
          </div>
        )}
      </div>
    </div>
  );
}
