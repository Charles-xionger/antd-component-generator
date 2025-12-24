// components/canvas/message-list.tsx
"use client";

import { useCallback, useState } from "react";
import type { Message } from "./types";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );

  const toggleMessageExpansion = useCallback((messageId: string) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  // 将连续的 AI 消息分组
  const groupedMessages: (Message | Message[])[] = [];
  let currentAiGroup: Message[] = [];

  messages.forEach((message, index) => {
    if (message.type === "ai") {
      currentAiGroup.push(message);
      if (
        index === messages.length - 1 ||
        messages[index + 1]?.type === "human"
      ) {
        groupedMessages.push([...currentAiGroup]);
        currentAiGroup = [];
      }
    } else {
      groupedMessages.push(message);
    }
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 message-list">
      {groupedMessages.map((item, groupIndex) => {
        // 用户消息
        if (!Array.isArray(item)) {
          return (
            <div
              key={item.id}
              className="bg-blue-100 ml-auto max-w-xs p-3 rounded-lg"
            >
              <div className="whitespace-pre-wrap text-sm text-gray-900">
                {item.content}
              </div>
            </div>
          );
        }

        // AI 消息组
        const aiMessages = item;
        const groupId = `group-${groupIndex}`;
        const isExpanded = expandedMessages.has(groupId);

        const hasCode = aiMessages.some((msg) =>
          msg.content.includes("<boltArtifact")
        );
        const hasApprove = aiMessages.some((msg) =>
          msg.content.includes("APPROVE")
        );

        let summary = "AI 正在处理...";
        let status: "processing" | "completed" | "reviewing" = "processing";

        if (hasCode && hasApprove) {
          summary = "✅ 代码生成完成";
          status = "completed";
        } else if (hasCode) {
          summary = "📝 代码已生成";
          status = "reviewing";
        } else if (hasApprove) {
          summary = "✅ 审核通过";
          status = "completed";
        } else {
          const firstMsg = aiMessages[0]?.content || "";
          if (firstMsg.includes("路由决策")) {
            summary = "🔄 正在处理请求...";
          } else {
            const lines = firstMsg
              .split("\n")
              .filter((line) => line.trim() && !line.includes("路由"));
            if (lines.length > 0) {
              const firstLine = lines[0].substring(0, 50);
              summary = firstLine + (lines[0].length > 50 ? "..." : "");
            }
          }
        }

        return (
          <div
            key={groupId}
            className="bg-white border border-gray-200 rounded-lg shadow-sm mr-auto max-w-2xl overflow-hidden"
          >
            {/* 折叠头部 */}
            <div
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleMessageExpansion(groupId)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* 状态图标 */}
                  <div className="shrink-0 mt-0.5">
                    {status === "completed" ? (
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-green-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    ) : status === "reviewing" ? (
                      <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-yellow-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* 摘要 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {summary}
                    </div>
                    <div className="text-xs text-gray-500">
                      {aiMessages.length} 个步骤
                      {hasCode && " • 包含代码"}
                      {hasApprove && " • 已审核"}
                    </div>
                  </div>
                </div>

                {/* 展开/收起按钮 */}
                <button
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-transform duration-200"
                  style={{
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 展开内容 */}
            {isExpanded && (
              <div className="border-t border-gray-200 bg-gray-50">
                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                  {aiMessages.map((msg, index) => {
                    const isCodeMsg = msg.content.includes("<boltArtifact");
                    const isApproveMsg = msg.content
                      .toUpperCase()
                      .includes("APPROVE");
                    const isRejectMsg = msg.content
                      .toUpperCase()
                      .includes("REJECT");
                    const isRoutingMsg = msg.content.includes("路由决策");

                    if (isRoutingMsg) {
                      return null;
                    }

                    return (
                      <div key={msg.id} className="text-xs">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-xs font-medium text-gray-600">
                            {index + 1}
                          </div>
                          <div className="font-medium text-gray-700">
                            {isCodeMsg
                              ? "📝 代码生成"
                              : isApproveMsg
                              ? "✅ 审核通过"
                              : isRejectMsg
                              ? "❌ 需要修改"
                              : "🤖 AI 回复"}
                          </div>
                        </div>

                        <div className="ml-7 pl-4 border-l-2 border-gray-200">
                          {isCodeMsg ? (
                            <div className="bg-gray-800 text-gray-300 p-3 rounded text-xs font-mono overflow-x-auto">
                              <div className="text-green-400 mb-1">
                                &lt;boltArtifact&gt;
                              </div>
                              <div className="text-gray-400 ml-2 space-y-1">
                                {msg.content
                                  .match(/filePath="([^"]+)"/g)
                                  ?.map((match, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-1"
                                    >
                                      <span className="text-blue-400">📄</span>
                                      <span>
                                        {match
                                          .replace('filePath="', "")
                                          .replace('"', "")}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                              <div className="text-green-400 mt-1">
                                &lt;/boltArtifact&gt;
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-600 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
                              {msg.content}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mr-auto max-w-xs p-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
            </div>
            <div className="text-sm text-gray-600">AI 正在思考...</div>
          </div>
        </div>
      )}
    </div>
  );
}
