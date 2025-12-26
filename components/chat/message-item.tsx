// components/chat/message-item.tsx
"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Code2,
  ChevronDown,
  ChevronRight,
  FileCode,
  AlertCircle,
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
  if (!steps || steps.length === 0) return false;
  return steps.some((s) => s.status === "running");
}

// 检查是否全部完成（历史数据没有 steps 时，如果有 artifact 就认为完成）
function isCompleted(
  steps: AgentStep[] | undefined,
  hasArtifact: boolean
): boolean {
  // 历史数据：没有 steps 但有 artifact，认为已完成
  if (!steps || steps.length === 0) {
    return hasArtifact;
  }
  // 实时数据：检查 reviewer 是否完成
  const hasReviewer = steps.some((s) => s.agent === "reviewer");
  if (!hasReviewer) return false;
  return steps.every((s) => s.status === "completed");
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
  const completed = isCompleted(message.agentSteps, !!messageArtifact);

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
  reviewResult,
  reviewReason,
  onExpand,
  rawContent,
}: {
  artifact: Artifact | null;
  isGenerating: boolean;
  isCompleted: boolean;
  reviewResult: ReviewResult;
  reviewReason?: string;
  onExpand?: () => void;
  rawContent: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 状态配置
  const getStatusConfig = () => {
    if (isGenerating) {
      return {
        icon: Loader2,
        iconClass: "animate-spin text-blue-500",
        text: "生成中...",
        textClass: "text-blue-600 dark:text-blue-400",
        borderClass: "border-blue-200 dark:border-blue-800",
        bgClass: "bg-blue-50/50 dark:bg-blue-900/10",
      };
    }
    if (reviewResult === "reject") {
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
      return {
        icon: CheckCircle2,
        iconClass: "text-green-500",
        text: "生成完成",
        textClass: "text-green-600 dark:text-green-400",
        borderClass: "border-green-200 dark:border-green-800",
        bgClass: "bg-green-50/50 dark:bg-green-900/10",
      };
    }
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
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${status.borderClass} ${status.bgClass}`}
        >
          <StatusIcon className={`h-4 w-4 ${status.iconClass}`} />
          <span className={`text-sm font-medium ${status.textClass}`}>
            {status.text}
          </span>
          {reviewResult === "reject" && reviewReason && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              - {reviewReason}
            </span>
          )}
        </div>

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
