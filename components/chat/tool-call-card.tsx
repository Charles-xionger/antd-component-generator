// components/chat/tool-call-card.tsx
"use client";

import { Loader2, CheckCircle2, XCircle, Wrench } from "lucide-react";
import type { ToolCall } from "@/hooks/use-chat";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { name, status, args, result, error } = toolCall;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="rounded-md bg-orange-100 p-1.5 dark:bg-orange-900/30">
          <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </div>
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {name}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* Arguments (collapsed by default) */}
      {Object.keys(args).length > 0 && (
        <details className="mb-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
            查看参数
          </summary>
          <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
            {JSON.stringify(args, null, 2)}
          </pre>
        </details>
      )}

      {/* Status Content */}
      {status === "running" && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">执行中...</span>
        </div>
      )}

      {status === "success" && result && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1">执行结果:</div>
          <div className="text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded text-gray-800 dark:text-gray-200 max-h-40 overflow-auto">
            {formatResult(result)}
          </div>
        </div>
      )}

      {status === "error" && error && (
        <div className="mt-2">
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ToolCall["status"] }) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          等待中
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          执行中
        </span>
      );
    case "success":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          成功
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          失败
        </span>
      );
  }
}

function formatResult(result: string): string {
  try {
    // Try to parse as JSON and format it
    const parsed = JSON.parse(result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // Return as-is if not JSON
    return result;
  }
}
