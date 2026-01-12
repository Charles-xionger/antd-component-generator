// components/chat/message-item.tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Streamdown } from "streamdown";
import { Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Message } from "@/hooks/use-chat";
import type { Artifact } from "@/components/canvas";
import { ThinkingCard } from "./thinking-card";
import { CodeGenerationCard } from "./code-generation-card";
import {
  useMessageParser,
  parseArtifactFromContent,
} from "@/hooks/use-message-parser";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  threadId: string; // 用于删除消息
  onMessageDeleted?: () => void; // 删除成功回调
  onRegenerate?: (messageId: string) => void; // 重新生成回调
}

export function MessageItem({
  message,
  messages,
  threadId,
  onMessageDeleted,
  onRegenerate,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // 删除消息（暂时注释掉，待优化后再启用）
  const handleDeleteMessage = async () => {
    toast.info("删除功能暂时禁用，正在优化中");
    setShowDeleteDialog(false);
    return;

    // setIsDeleting(true);
    // setShowDeleteDialog(false);

    // try {
    //   const response = await fetch("/api/agent/delete-message", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ threadId, messageId: message.id }),
    //   });

    //   if (!response.ok) {
    //     const error = await response.json();
    //     throw new Error(error.error || "删除失败");
    //   }

    //   console.log("[MessageItem] 消息删除成功:", message.id);
    //   toast.success("消息已删除");
    //   onMessageDeleted?.();
    // } catch (error) {
    //   console.error("[MessageItem] 删除消息失败:", error);
    //   toast.error(
    //     error instanceof Error ? error.message : "删除失败，请稍后重试"
    //   );
    // } finally {
    //   setIsDeleting(false);
    // }
  };

  // 删除按钮组件（AI 消息使用）
  const DeleteButton = () => (
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogTrigger asChild>
        <button
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
          title="删除消息"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除这条消息吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteMessage}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

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
      <div className="flex flex-col items-end gap-2 group">
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

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* 重新生成按钮 - 已暂时隐藏 */}
          {/* <button
            onClick={() => onRegenerate?.(message.id)}
            disabled={isDeleting}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="重新生成"
          >
            <RotateCcw className="w-4 h-4" />
          </button> */}

          {/* 🔥 删除按钮已暂时隐藏 */}
          {/* <AlertDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <AlertDialogTrigger asChild>
              <button
                disabled={isDeleting}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                title="删除消息"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  确定要删除这条消息吗？此操作无法撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteMessage}>
                  删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog> */}
        </div>
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
      <div className="flex justify-start group">
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

          {/* 删除按钮 - 已暂时隐藏 */}
          {/* <DeleteButton /> */}
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
      <div className="flex justify-start group">
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

          {/* 删除按钮 - 已暂时隐藏 */}
          {/* <DeleteButton /> */}
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
        <div className="flex justify-start group">
          <div className="max-w-[85%] space-y-2">
            <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
              <Streamdown className="prose prose-sm max-w-none">
                {message.content}
              </Streamdown>
            </div>
            {/* <DeleteButton /> */}
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start group">
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

          {/* 删除按钮 - 已暂时隐藏 */}
          {/* <DeleteButton /> */}
        </div>
      </div>
    );
  }

  // AI 消息 - 普通聊天回复（非代码生成，非architect）
  if (!isCodingMessage && !isArchitectMessage) {
    return (
      <div className="flex justify-start group">
        <div className="max-w-[85%] space-y-2">
          <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
            <Streamdown className="prose prose-sm max-w-none">
              {message.content}
            </Streamdown>
          </div>
          {/* <DeleteButton /> */}
        </div>
      </div>
    );
  }

  // AI 消息 - 兜底（不应该到这里，如果到了说明有逻辑问题）
  // 为了安全，使用 cleanContent 清理 XML 标签
  console.warn("[MessageItem] 进入兜底分支，消息ID:", message.id);

  return (
    <div className="flex justify-start group">
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
          <Streamdown className="prose prose-sm max-w-none">
            {message.content}
          </Streamdown>
        </div>
        {/* <DeleteButton /> */}
      </div>
    </div>
  );
}
