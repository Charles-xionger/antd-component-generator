// components/canvas/canvas-card.tsx
"use client";

import { Code2, ChevronRight, FileCode, Loader2 } from "lucide-react";
import type { ParsedFile } from "./types";

interface CanvasCardProps {
  artifact: {
    id: string;
    title: string;
    files: ParsedFile[];
  };
  versionNumber?: number;
  onExpand: () => void;
  isLoading?: boolean;
}

export function CanvasCard({
  artifact,
  versionNumber,
  onExpand,
  isLoading = false,
}: CanvasCardProps) {
  return (
    <div
      onClick={onExpand}
      className={`
        group cursor-pointer rounded-lg border bg-white p-4 shadow-sm transition-all
        dark:bg-gray-800
        ${
          isLoading
            ? "border-blue-300 ring-2 ring-blue-100 dark:border-blue-700 dark:ring-blue-900/30"
            : "border-gray-200 hover:border-blue-300 hover:shadow-md dark:border-gray-700"
        }
      `}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`
              rounded-md p-2
              ${
                isLoading
                  ? "bg-blue-500 dark:bg-blue-600"
                  : "bg-blue-100 dark:bg-blue-900/30"
              }
            `}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Code2
                className={`h-4 w-4 ${
                  isLoading ? "text-white" : "text-blue-600 dark:text-blue-400"
                }`}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              {artifact.title}
              {isLoading && (
                <span className="text-xs font-normal text-blue-600 dark:text-blue-400">
                  生成中...
                </span>
              )}
            </div>
            {versionNumber && (
              <div className="text-xs text-gray-500">版本 {versionNumber}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-400">
          <span>展开编辑</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      {/* File List */}
      <div className="space-y-1">
        {artifact.files.slice(0, 3).map((file, index) => (
          <div
            key={index}
            className={`
              flex items-center gap-2 rounded px-2 py-1 text-sm
              ${
                isLoading
                  ? "animate-pulse text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400"
              }
            `}
          >
            <FileCode className="h-3 w-3" />
            <span className="truncate">{file.path}</span>
          </div>
        ))}
        {artifact.files.length > 3 && (
          <div className="px-2 py-1 text-xs text-gray-500">
            +{artifact.files.length - 3} 个文件
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
        <div className="text-xs text-gray-500">
          {artifact.files.length} 个文件
        </div>
        <div className="text-xs text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400">
          {isLoading ? "生成中，点击查看进度 →" : "点击查看详情 →"}
        </div>
      </div>
    </div>
  );
}
