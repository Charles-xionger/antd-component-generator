// components/chat/code-generation-card.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Code2, FileCode } from "lucide-react";
import type { Artifact } from "@/components/canvas";

interface CodeGenerationCardProps {
  artifact: Artifact | null;
  isStreaming?: boolean;
}

export function CodeGenerationCard({
  artifact,
  isStreaming = false,
}: CodeGenerationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 修复：即使 artifact 为 null，如果正在生成中，也应该显示卡片
  if (!artifact && !isStreaming) {
    return null;
  }

  const fileCount = artifact?.files.length || 0;
  const title = artifact?.title || "代码生成";

  return (
    <div className="my-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {title}
          </span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <span className="animate-pulse">●</span>
              生成中...
            </span>
          )}
          {!isStreaming && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {fileCount} 个文件
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {artifact && artifact.files.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                📁 生成的文件：
              </div>
              <div className="space-y-1">
                {artifact.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 flex-1">
                      {file.path}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {file.content.split("\n").length} 行
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
              {isStreaming ? "正在生成文件..." : "暂无文件"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
