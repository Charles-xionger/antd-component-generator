// components/chat/thinking-card.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Lightbulb } from "lucide-react";

interface ThinkingCardProps {
  content: string;
  duration?: string;
  isStreaming?: boolean;
}

export function ThinkingCard({
  content,
  duration = "思考中",
  isStreaming = false,
}: ThinkingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            架构规划
          </span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <span className="animate-pulse">●</span>
              生成中...
            </span>
          )}
          {!isStreaming && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {duration}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div
              className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: formatArchitectPlan(content),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 格式化 Architect Plan 内容，支持 Markdown 渲染
 */
function formatArchitectPlan(content: string): string {
  // 移除 <architectPlan> 标签
  let formatted = content
    .replace(/<architectPlan>/g, "")
    .replace(/<\/architectPlan>/g, "");

  // 转换 Markdown 语法为 HTML
  // 标题
  formatted = formatted.replace(
    /^## (.+)$/gm,
    '<h2 class="text-base font-semibold mt-4 mb-2 text-gray-800 dark:text-gray-100">$1</h2>'
  );
  formatted = formatted.replace(
    /^### (.+)$/gm,
    '<h3 class="text-sm font-semibold mt-3 mb-2 text-gray-700 dark:text-gray-200">$1</h3>'
  );

  // 列表项
  formatted = formatted.replace(
    /^- (.+)$/gm,
    '<li class="ml-4 text-sm text-gray-700 dark:text-gray-300">$1</li>'
  );
  formatted = formatted.replace(
    /^(\d+)\. (.+)$/gm,
    '<li class="ml-4 text-sm text-gray-700 dark:text-gray-300"><strong>$2</strong></li>'
  );

  // 加粗（**text**）
  formatted = formatted.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="font-semibold text-gray-800 dark:text-gray-100">$1</strong>'
  );

  // 行内代码（`code`）
  formatted = formatted.replace(
    /`(.+?)`/g,
    '<code class="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">$1</code>'
  );

  // 段落（空行分隔）
  formatted = formatted.replace(
    /\n\n/g,
    '</p><p class="mt-2 text-sm text-gray-700 dark:text-gray-300">'
  );

  // 包裹在段落标签中
  formatted = `<p class="text-sm text-gray-700 dark:text-gray-300">${formatted}</p>`;

  return formatted;
}
