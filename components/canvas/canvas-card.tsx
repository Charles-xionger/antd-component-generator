// components/canvas/canvas-card.tsx
"use client";

import { Code2, ChevronRight, Loader2 } from "lucide-react";
import type { ParsedFile } from "./types";

interface CanvasCardProps {
  artifact: {
    id: string;
    title: string;
    files: ParsedFile[];
  };
  onExpand: () => void;
  isLoading?: boolean;
}

export function CanvasCard({
  artifact,
  onExpand,
  isLoading = false,
}: CanvasCardProps) {
  return (
    <div
      onClick={onExpand}
      className={`
        relative cursor-pointer overflow-hidden rounded-xl border bg-linear-to-br from-white to-gray-50/50 
        shadow-sm dark:from-gray-800 dark:to-gray-900/50 dark:border-gray-700
        ${
          isLoading
            ? "border-blue-200 bg-linear-to-br from-blue-50 to-blue-100/30 dark:border-blue-600 dark:from-blue-900/20 dark:to-blue-800/20"
            : "border-gray-200 dark:border-gray-700"
        }
      `}
    >
      {/* 主内容 */}
      <div className="relative p-6">
        {/* 图标和标题区域 */}
        <div className="mb-4 flex items-start gap-4">
          <div
            className={`
              shrink-0 rounded-lg p-3
              ${
                isLoading
                  ? "bg-blue-500 shadow-lg shadow-blue-500/25"
                  : "bg-linear-to-br from-blue-500 to-blue-600 shadow-md shadow-blue-500/20"
              }
            `}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Code2 className="h-5 w-5 text-white" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {artifact.title}
              </h3>
              {isLoading && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 w-16 bg-blue-200 rounded-full overflow-hidden dark:bg-blue-800">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse" />
                  </div>
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    生成中...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 操作区域 */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? "正在生成代码..." : "点击查看和编辑"}
          </div>
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <span className="text-sm font-medium">打开</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
