// components/canvas/chat-panel.tsx
"use client";

import { MessageList } from "./message-list";
import type { Message } from "./types";

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  input: string;
  threadId?: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
}

export function ChatPanel({
  messages,
  isLoading,
  input,
  threadId,
  onInputChange,
  onSendMessage,
}: ChatPanelProps) {
  return (
    <div className="w-1/3 flex flex-col border-r min-h-0">
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading && input.trim()) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            placeholder="请描述你想要的功能..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
            disabled={isLoading}
          />
          <button
            onClick={(e) => {
              e.preventDefault();
              if (!isLoading && input.trim()) {
                onSendMessage();
              }
            }}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "发送中..." : "发送"}
          </button>
        </div>
        {threadId && (
          <div className="text-xs text-gray-600 mt-2">会话 ID: {threadId}</div>
        )}
      </div>
    </div>
  );
}
