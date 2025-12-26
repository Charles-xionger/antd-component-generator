// components/chat/message-item.tsx
"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Code2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  FileCode,
} from "lucide-react";
import type { Message, AgentStep } from "@/hooks/use-chat";
import {
  CanvasCard,
  type Artifact,
  type ParsedFile,
} from "@/components/canvas";

interface MessageItemProps {
  message: Message;
  onCanvasExpand?: () => void;
}

// 解析审查结果
type ReviewResult = "approve" | "reject" | null;

function parseReviewResult(content: string): {
  result: ReviewResult;
  reason?: string;
} {
  const match = content.match(/<reviewer_result>([\s\S]*?)<\/reviewer_result>/);
  if (match) {
    const result = match[1].trim();
    if (result.toUpperCase().startsWith("APPROVE")) {
      return { result: "approve" };
    } else if (result.toUpperCase().startsWith("REJECT")) {
      return { result: "reject", reason: result.replace(/^REJECT:\s*/i, "") };
    }
  }
  if (content.includes("APPROVE")) return { result: "approve" };
  const rejectMatch = content.match(/REJECT:\s*(.+)/);
  if (rejectMatch) return { result: "reject", reason: rejectMatch[1] };
  return { result: null };
}

// 从消息内容中解析 artifact
function parseArtifactFromContent(content: string): Artifact | null {
  if (!content.includes("<boltArtifact")) return null;

  let id = "unknown";
  let title = "Generated Code";

  const match1 = content.match(
    /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>/
  );
  const match2 = content.match(
    /<boltArtifact[^>]*title="([^"]*)"[^>]*id="([^"]*)"[^>]*>/
  );

  if (match1) {
    id = match1[1];
    title = match1[2];
  } else if (match2) {
    id = match2[2];
    title = match2[1];
  }

  const files: ParsedFile[] = [];
  const fileRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    json: "json",
    html: "html",
  };

  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    const filePath = match[1];
    const ext = filePath.split(".").pop() || "";
    files.push({
      path: filePath,
      content: match[2].trim(),
      language: languageMap[ext] || "text",
    });
  }

  if (files.length === 0) return null;
  return { id, title, files };
}

// 检查是否正在生成
function isGenerating(steps: AgentStep[] | undefined): boolean {
  if (steps && steps.length > 0) {
    // 有 agentSteps 时，检查是否有正在运行的步骤
    return steps.some((s) => s.status === "running");
  }

  // 没有 agentSteps 时，直接认为历史数据已完成，不再生成
  // 历史数据加载时不应该显示为"生成中"状态
  return false;
}

// 检查是否全部完成
function isCompleted(
  steps: AgentStep[] | undefined,
  content: string,
  hasArtifact: boolean
): boolean {
  // 有 agentSteps 时，检查所有步骤是否完成
  if (steps && steps.length > 0) {
    return steps.every((s) => s.status === "completed");
  }

  // 没有 agentSteps 时（历史数据），认为都是已完成的
  // 历史数据不应该显示为处理中状态
  if (hasArtifact) {
    // 有 artifact 的历史数据都认为是完成的
    return true;
  }

  // 没有 artifact 但有实质内容的消息也认为是完成的
  return !!(content && content.trim().length > 0);
}

// 检查是否需要修改（审查未通过）
function needsModification(
  steps: AgentStep[] | undefined,
  content: string,
  reviewResult: ReviewResult
): boolean {
  if (reviewResult === "reject") return true;

  // 历史数据中检查是否包含拒绝信息
  if (!steps || steps.length === 0) {
    return content.includes("REJECT:") || content.includes("需要修改");
  }

  return false;
}

export function MessageItem({ message, onCanvasExpand }: MessageItemProps) {
  const isUser = message.role === "user";

  const messageArtifact = useMemo(() => {
    if (isUser || !message.hasArtifact) return null;
    return parseArtifactFromContent(message.content);
  }, [message.content, message.hasArtifact, isUser]);

  const reviewResult = useMemo(() => {
    if (isUser) return { result: null };
    return parseReviewResult(message.content);
  }, [message.content, isUser]);

  const generating = isGenerating(message.agentSteps);
  const completed = isCompleted(
    message.agentSteps,
    message.content,
    !!messageArtifact
  );
  const needsModify = needsModification(
    message.agentSteps,
    message.content,
    reviewResult.result
  );

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

  // AI 消息 - 简化展示
  const hasContent = message.agentSteps && message.agentSteps.length > 0;

  if (!hasContent && !messageArtifact) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] space-y-3">
        {/* 主卡片：生成状态 + 代码预览 */}
        <GenerationCard
          artifact={messageArtifact}
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
        {/* 只在有审查拒绝信息时显示状态指示器 */}
        {(needsModification || reviewResult === "reject") && (
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

// 清理内容，移除内部标签
function cleanContent(content: string): string {
  let cleaned = content;
  cleaned = cleaned.replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/g, "");
  cleaned = cleaned.replace(/<architect_plan>[\s\S]*?<\/architect_plan>/g, "");
  cleaned = cleaned.replace(
    /<reviewer_result>[\s\S]*?<\/reviewer_result>/g,
    ""
  );
  cleaned = cleaned.replace(/^路由决策:.*$/gm, "");
  cleaned = cleaned.replace(/^网络连接错误.*$/gm, "");
  cleaned = cleaned.replace(
    /^\s*\{[\s\S]*?"mode"[\s\S]*?"files"[\s\S]*?\}\s*$/gm,
    ""
  );
  cleaned = cleaned.replace(/^APPROVE\s*$/gm, "");
  cleaned = cleaned.replace(/^REJECT:.*$/gm, "");
  return cleaned.trim();
}
