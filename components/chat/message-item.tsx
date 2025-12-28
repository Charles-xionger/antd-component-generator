// components/chat/message-item.tsx
"use client";

import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Code2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  FileCode,
} from "lucide-react";
import type { Message } from "@/hooks/use-chat";
import { CanvasCard } from "@/components/canvas";
import type { Artifact } from "@/components/canvas";
import {
  useMessageParser,
  parseArtifactFromContent,
  cleanContent,
  type ArchitectPlan,
  type ReviewResult,
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
  onCanvasExpand?: () => void;
}

export function MessageItem({
  message,
  messages,
  onCanvasExpand,
}: MessageItemProps) {
  const isUser = message.role === "user";

  // 获取前一条消息的 artifact（用于乐观更新）
  const previousArtifact = isUser
    ? null
    : findPreviousArtifact(messages, message.id);

  // 使用 hook 解析消息内容，传入历史 artifact
  const {
    artifact,
    architectPlan,
    reviewResult,
    isArchitectMessage,
    isCodingMessage,
    needsModification: needsModify,
  } = useMessageParser(message.content, isUser, previousArtifact);

  // 简化状态判断
  const generating = isCodingMessage && !artifact;
  const completed = !!artifact;

  // 用户消息
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="rounded-lg bg-blue-500 px-4 py-2 text-white">
            <div className="whitespace-pre-wrap wrap-break-word">
              {message.content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI 消息 - Architect 规划
  if (isArchitectMessage && architectPlan) {
    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%]">
          <ArchitectPlanCard plan={architectPlan} />
        </div>
      </div>
    );
  }

  // AI 消息 - 普通聊天回复（非代码生成）
  if (!isCodingMessage) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <div className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
            <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
              {message.content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI 消息 - 代码生成相关
  if (!message.content && !artifact) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] space-y-3">
        {/* 主卡片：生成状态 + 代码预览 */}
        <GenerationCard
          artifact={artifact}
          isGenerating={generating}
          isCompleted={completed}
          needsModification={needsModify}
          reviewResult={reviewResult.result}
          reviewReason={reviewResult.reason}
          onExpand={onCanvasExpand}
          rawContent={message.content}
        />
      </div>
    </div>
  );
}

// ============================================
// Architect 规划卡片
// ============================================
function ArchitectPlanCard({ plan }: { plan: ArchitectPlan }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isCreateMode = plan.mode === "create";
  const files = isCreateMode
    ? plan.files || []
    : plan.target_files?.map((path) => ({ path, description: "" })) || [];

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-900/10">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Code2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex flex-col items-start">
            <span className="font-medium text-purple-700 dark:text-purple-300">
              {isCreateMode ? "架构设计完成" : "修改方案设计完成"}
            </span>
            <span className="text-xs text-purple-600 dark:text-purple-400">
              {isCreateMode
                ? `规划了 ${files?.length || 0} 个文件`
                : `需要修改 ${files?.length || 0} 个文件`}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-purple-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-purple-400" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3 border-t border-purple-100 px-4 py-3 dark:border-purple-800">
          {/* 文件列表 */}
          {files && files.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-purple-700 dark:text-purple-300">
                📁 {isCreateMode ? "文件结构" : "修改文件"}
              </div>
              <div className="space-y-1">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded bg-white/50 px-2 py-1.5 text-xs dark:bg-purple-950/20"
                  >
                    <FileCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" />
                    <div className="flex-1">
                      <div className="font-mono text-purple-900 dark:text-purple-200">
                        {file.path}
                      </div>
                      {file.description && (
                        <div className="mt-0.5 text-purple-600 dark:text-purple-400">
                          {file.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 依赖列表 */}
          {plan.dependencies && plan.dependencies.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-purple-700 dark:text-purple-300">
                📦 技术栈
              </div>
              <div className="flex flex-wrap gap-1">
                {plan.dependencies.map((dep, idx) => (
                  <span
                    key={idx}
                    className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 架构说明 */}
          {plan.architecture_notes && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-purple-700 dark:text-purple-300">
                💡 架构说明
              </div>
              <div className="rounded bg-white/50 px-3 py-2 text-xs text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
                {plan.architecture_notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// 简化的生成卡片（可折叠）
// ============================================
function GenerationCard({
  artifact,
  isGenerating,
  isCompleted,
  needsModification,
  reviewResult,
  reviewReason,
  onExpand,
  rawContent,
}: {
  artifact: Artifact | null;
  isGenerating: boolean;
  isCompleted: boolean;
  needsModification: boolean;
  reviewResult: ReviewResult;
  reviewReason?: string;
  onExpand?: () => void;
  rawContent: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 状态配置 - 优化状态判断优先级
  const getStatusConfig = () => {
    if (isGenerating) {
      // 正在生成中
      return {
        icon: Loader2,
        iconClass: "animate-spin text-blue-500",
        text: "生成中...",
        textClass: "text-blue-600 dark:text-blue-400",
        borderClass: "border-blue-200 dark:border-blue-800",
        bgClass: "bg-blue-50/50 dark:bg-blue-900/10",
      };
    }

    if (needsModification || reviewResult === "reject") {
      // 需要修改
      return {
        icon: AlertCircle,
        iconClass: "text-amber-500",
        text: "需要修改",
        textClass: "text-amber-600 dark:text-amber-400",
        borderClass: "border-amber-200 dark:border-amber-800",
        bgClass: "bg-amber-50/50 dark:bg-amber-900/10",
      };
    }

    if (isCompleted || reviewResult === "approve") {
      // 生成完成
      return {
        icon: CheckCircle2,
        iconClass: "text-green-500",
        text: "生成完成",
        textClass: "text-green-600 dark:text-green-400",
        borderClass: "border-green-200 dark:border-green-800",
        bgClass: "bg-green-50/50 dark:bg-green-900/10",
      };
    }

    // 处理中（默认状态）
    return {
      icon: Code2,
      iconClass: "text-gray-400",
      text: "处理中",
      textClass: "text-gray-500",
      borderClass: "border-gray-200 dark:border-gray-700",
      bgClass: "bg-gray-50/50 dark:bg-gray-800/50",
    };
  };

  const status = getStatusConfig();
  const StatusIcon = status.icon;

  // 如果有 artifact，显示 CanvasCard
  if (artifact) {
    return (
      <div className="space-y-2">
        {/* 状态指示器 */}
        {needsModification || reviewResult === "reject" ? (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10`}
          >
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
              需要修改
            </span>
            {reviewReason && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                - {reviewReason}
              </span>
            )}
          </div>
        ) : (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10`}
          >
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              生成完成
            </span>
          </div>
        )}

        {/* 代码卡片 */}
        <CanvasCard
          artifact={artifact}
          onExpand={onExpand || (() => {})}
          isLoading={isGenerating}
        />

        {/* 折叠的原始输出（点击展开） */}
        <CollapsibleRawOutput content={rawContent} />
      </div>
    );
  }

  // 没有 artifact 时，显示简单状态卡片
  return (
    <div
      className={`rounded-lg border ${status.borderClass} ${status.bgClass}`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-5 w-5 ${status.iconClass}`} />
          <span className={`font-medium ${status.textClass}`}>
            {status.text}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
          <pre className="max-h-60 overflow-auto text-xs text-gray-600 dark:text-gray-400">
            {cleanContent(rawContent)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================
// 可折叠的原始输出
// ============================================
function CollapsibleRawOutput({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cleanedContent = cleanContent(content);

  if (!cleanedContent || cleanedContent.length < 50) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm"
      >
        <div className="flex items-center gap-2 text-gray-500">
          <FileCode className="h-3.5 w-3.5" />
          <span>查看详细输出</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
            {cleanedContent}
          </pre>
        </div>
      )}
    </div>
  );
}
