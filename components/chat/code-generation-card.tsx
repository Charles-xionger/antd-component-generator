// components/chat/code-generation-card.tsx
"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  RotateCcw,
} from "lucide-react";
import type { Artifact } from "@/components/canvas";
import { Button } from "@/components/ui/button";
import { buildResultSummary } from "@/lib/chat/item-presentation";

interface CodeGenerationCardProps {
  artifact: Artifact | null;
  isStreaming?: boolean;
  versionNumber?: number;
  onViewChanges?: () => void;
  onUndo?: () => void;
}

export function CodeGenerationCard({
  artifact,
  isStreaming = false,
  versionNumber,
  onViewChanges,
  onUndo,
}: CodeGenerationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 修复：即使 artifact 为 null，如果正在生成中，也应该显示卡片
  if (!artifact && !isStreaming) {
    return null;
  }

  const fileCount = artifact?.files.length || 0;
  const title = artifact?.title || "代码生成";
  const result = versionNumber
    ? buildResultSummary(versionNumber, fileCount)
    : undefined;

  if (!isStreaming && artifact) {
    return (
      <div className="my-3 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">
              {result?.title || `${title}已准备`}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {result?.description || `已生成 ${fileCount} 个文件`}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onViewChanges && (
                <Button size="sm" variant="outline" onClick={onViewChanges}>
                  查看变化
                </Button>
              )}
              {onUndo && (
                <Button size="sm" variant="ghost" onClick={onUndo}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  撤销
                </Button>
              )}
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setIsExpanded((current) => !current)}
                aria-expanded={isExpanded}
              >
                {fileCount} 个文件
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
        {isExpanded && (
          <div className="space-y-1 border-t bg-background/70 p-3">
            {artifact.files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
              >
                <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                <span className="text-muted-foreground">
                  {file.content.split("\n").length} 行
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 border rounded-lg overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <span className="animate-pulse">●</span>
              生成中...
            </span>
          )}
          {!isStreaming && (
            <span className="text-xs text-muted-foreground">
              {fileCount} 个文件
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t bg-muted">
          {artifact && artifact.files.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground mb-2">
                📁 生成的文件：
              </div>
              <div className="space-y-1">
                {artifact.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 bg-background rounded border"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs font-mono text-foreground flex-1">
                      {file.path}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {file.content.split("\n").length} 行
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              {isStreaming ? "正在生成文件..." : "暂无文件"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
