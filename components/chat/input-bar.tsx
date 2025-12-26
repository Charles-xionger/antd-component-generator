// components/chat/input-bar.tsx
"use client";

import { KeyboardEvent } from "react";
import { Send, Loader2, Code2 } from "lucide-react";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isCanvasMode?: boolean;
  placeholder?: string;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  isLoading,
  isCanvasMode = false,
  placeholder,
}: InputBarProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading && value.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };

  const defaultPlaceholder = isCanvasMode
    ? "继续编辑或提出新需求..."
    : "输入消息...";

  return (
    <div className="border-t border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {/* Canvas 模式前缀标签 (豆包风格) */}
        {isCanvasMode && (
          <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
            <Code2 className="h-4 w-4" />
            <span>Canvas</span>
          </div>
        )}

        {/* 输入框 */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
        />

        {/* 发送按钮 */}
        <button
          onClick={onSubmit}
          disabled={!value.trim() || isLoading}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">发送中...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">发送</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
