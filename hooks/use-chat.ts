"use client";

import { useState, useRef, useCallback } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface UseChatOptions {
  /** API 端点，默认 /api/agent/stream */
  api?: string;
  /** 初始消息列表 */
  initialMessages?: Message[];
  /** 初始 threadId，用于恢复对话 */
  threadId?: string;
  /** 发送消息前的回调 */
  onSend?: (message: string) => void;
  /** 收到响应后的回调 */
  onResponse?: (message: Message) => void;
  /** 发生错误时的回调 */
  onError?: (error: Error) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const {
    api = "/api/agent/stream",
    initialMessages = [],
    threadId: initialThreadId,
    onSend,
    onResponse,
    onError,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const threadIdRef = useRef(initialThreadId || crypto.randomUUID());
  const abortControllerRef = useRef<AbortController | null>(null);
  const mcpConfigIdRef = useRef<string | null>(null);

  /** 当前会话的 threadId */
  const threadId = threadIdRef.current;

  /** 发送消息 */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = { role: "user", content: content.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);
      onSend?.(content);

      // 创建新的 AbortController
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            threadId: threadIdRef.current,
            mcpConfigId: mcpConfigIdRef.current,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";

        // 添加空的 assistant 消息
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  assistantContent += data.content;
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = {
                      role: "assistant",
                      content: assistantContent,
                    };
                    return newMessages;
                  });
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: assistantContent,
        };
        onResponse?.(assistantMessage);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // 请求被取消，不处理
        }
        const error = err instanceof Error ? err : new Error("未知错误");
        setError(error);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "发生错误，请重试" },
        ]);
        onError?.(error);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, isLoading, onSend, onResponse, onError]
  );

  const setMcpConfigId = useCallback((id: string | null) => {
    mcpConfigIdRef.current = id;
  }, []);

  /** 表单提交处理 */
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (input.trim()) {
        sendMessage(input);
        setInput("");
      }
    },
    [input, sendMessage]
  );

  /** 停止当前请求 */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  /** 清空消息记录 */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /** 重置会话（清空消息并生成新的 threadId） */
  const resetChat = useCallback(() => {
    clearMessages();
    threadIdRef.current = crypto.randomUUID();
  }, [clearMessages]);

  /** 切换到指定的会话 */
  const switchThread = useCallback(
    (newThreadId: string, threadMessages: Message[] = []) => {
      threadIdRef.current = newThreadId;
      setMessages(threadMessages);
      setError(null);
    },
    []
  );

  /** 追加消息（用于恢复历史记录等场景） */
  const append = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  return {
    // 状态
    messages,
    input,
    isLoading,
    error,
    threadId,

    // 输入控制
    setInput,
    handleSubmit,

    // 消息操作
    sendMessage,
    append,
    clearMessages,
    resetChat,
    switchThread,

    // MCP 控制
    setMcpConfigId,

    // 请求控制
    stop,
  };
}
