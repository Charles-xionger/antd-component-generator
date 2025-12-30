"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageBuffer } from "@/lib/message-filter";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasArtifact?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "success" | "error";
  result?: string;
  error?: string;
}

export interface UseChatOptions {
  /** API 端点，默认 /api/agent/stream */
  api?: string;
  /** 初始 threadId，用于恢复对话 */
  threadId?: string;
  /** MCP 配置 ID */
  mcpConfigId?: string | null;
  /** 检测到 artifact 时的回调（流式和最终） */
  onArtifactDetected?: (content: string) => void;
  /** 后端保存成功时的回调 */
  onSaved?: () => void;
  /** 流式响应开始时的回调 */
  onStreamStart?: () => void;
  /** 流式响应完成时的回调 */
  onStreamComplete?: (content: string) => void;
  /** 工具调用时的回调 */
  onToolCall?: (toolCall: ToolCall) => void;
  /** 发生错误时的回调 */
  onError?: (error: Error) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const {
    api = "/api/agent/stream",
    threadId,
    mcpConfigId,
    onArtifactDetected,
    onSaved,
    onStreamStart,
    onStreamComplete,
    onToolCall,
    onError,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<
    Array<{ dataUrl: string; mime_type: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 使用 ref 存储回调，避免依赖变化导致死循环
  const onArtifactDetectedRef = useRef(onArtifactDetected);
  const onSavedRef = useRef(onSaved);
  const onStreamStartRef = useRef(onStreamStart);
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onToolCallRef = useRef(onToolCall);
  const onErrorRef = useRef(onError);

  // 同步更新 ref
  useEffect(() => {
    onArtifactDetectedRef.current = onArtifactDetected;
    onSavedRef.current = onSaved;
    onStreamStartRef.current = onStreamStart;
    onStreamCompleteRef.current = onStreamComplete;
    onToolCallRef.current = onToolCall;
    onErrorRef.current = onError;
  });

  // 标记是否已经加载过历史消息
  const historyLoadedRef = useRef<string | null>(null);

  // Fetch message history when threadId changes
  useEffect(() => {
    // 如果 threadId 没变，不重新加载
    if (historyLoadedRef.current === threadId) {
      return;
    }

    if (!threadId) {
      setMessages([]);
      historyLoadedRef.current = null;
      return;
    }

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/agent/history/${threadId}`);
        if (response.ok) {
          const data = await response.json();
          const formattedMessages = formatMessagesFromHistory(
            data.messages || []
          );
          setMessages(formattedMessages);

          // 标记已加载
          historyLoadedRef.current = threadId;

          // 历史消息不需要触发 onArtifactDetected
          // 因为历史消息已经完整，不需要创建乐观版本或触发实时处理
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [threadId]);

  /** 发送消息 */
  const sendMessage = useCallback(async () => {
    if ((!input.trim() && images.length === 0) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const currentImages = [...images];
    setImages([]);
    setIsLoading(true);
    setError(null);

    // 触发流式响应开始回调
    if (onStreamStartRef.current) {
      onStreamStartRef.current();
    }

    // 创建新的 AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Helper: read File to base64 (without prefix)
    async function readFileAsBase64(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1] || "";
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // Build payloadMessage: 始终发送字符串格式给后端
    const payloadMessage: string = userMessage.content;

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payloadMessage,
          images: currentImages,
          threadId,
          mcpConfigId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      let assistantContent = "";
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        toolCalls: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // 创建消息缓冲器，处理流式传输时标签被拆分的问题
      const messageBuffer = new MessageBuffer();

      // Process streaming response
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "content" || data.content) {
                const content = data.content || "";

                // 使用消息缓冲器判断是否应该显示
                const shouldShow = messageBuffer.append(content, data.metadata);

                // 如果需要过滤，跳过这条消息（不累积到 assistantContent）
                if (!shouldShow) {
                  console.log(
                    "[useChat] 过滤 chunk:",
                    content.substring(0, 20)
                  );
                  continue;
                }

                // 累积显示的内容
                assistantContent += content;
                const hasArtifact = assistantContent.includes("<boltArtifact");

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: assistantContent,
                          hasArtifact,
                        }
                      : msg
                  )
                );

                if (hasArtifact && onArtifactDetectedRef.current) {
                  onArtifactDetectedRef.current(assistantContent);
                }
              } else if (data.type === "tool_start") {
                // 使用 run_id 作为唯一标识符
                const toolCallId =
                  data.tool_call_id || data.run_id || Date.now().toString();
                const toolCall: ToolCall = {
                  id: toolCallId,
                  name: data.tool_name || data.tool || "unknown",
                  args: data.args || {},
                  status: "running",
                };

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          toolCalls: [...(msg.toolCalls || []), toolCall],
                        }
                      : msg
                  )
                );

                if (onToolCallRef.current) {
                  onToolCallRef.current(toolCall);
                }
              } else if (data.type === "tool_end") {
                const toolCallId = data.tool_call_id || data.run_id;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          toolCalls: msg.toolCalls?.map((tc) =>
                            tc.id === toolCallId
                              ? {
                                  ...tc,
                                  status: "success" as const,
                                  result: data.result || data.output,
                                }
                              : tc
                          ),
                        }
                      : msg
                  )
                );
              } else if (data.type === "tool_error") {
                const toolCallId = data.tool_call_id || data.run_id;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          toolCalls: msg.toolCalls?.map((tc) =>
                            tc.id === toolCallId
                              ? {
                                  ...tc,
                                  status: "error" as const,
                                  error: data.error,
                                }
                              : tc
                          ),
                        }
                      : msg
                  )
                );
              }
              // 注意：移除了 data.type === "saved" 的处理
              // 现在由前端主动保存，不再依赖后端的保存信号
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 流式响应完成，触发回调
      if (onStreamCompleteRef.current && assistantContent) {
        onStreamCompleteRef.current(assistantContent);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return; // 请求被取消，不处理
      }
      const error = err instanceof Error ? err : new Error("未知错误");
      setError(error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "抱歉，发生了错误。请重试。",
        },
      ]);
      onErrorRef.current?.(error);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, input, isLoading, threadId, mcpConfigId]);

  /** 表单提交处理 */
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      sendMessage();
    },
    [sendMessage]
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

  return {
    // 状态
    messages,
    input,
    images,
    isLoading,
    error,
    threadId,

    // 输入控制
    setInput,
    setImages,
    handleSubmit,

    // 消息操作
    sendMessage,
    clearMessages,

    // 请求控制
    stop,
  };
}

// 原始消息类型定义
interface RawMessage {
  id?: string;
  type: string;
  content: string | Array<{ text?: string }>;
  toolCalls?: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  name?: string; // tool 消息的工具名称
  tool_call_id?: string; // tool 消息关联的 tool_call_id
}

// Helper function to format messages from history
function formatMessagesFromHistory(rawMessages: RawMessage[]): Message[] {
  const formattedMessages: Message[] = [];

  // 收集所有 tool 消息的响应，用于匹配 tool calls
  const toolResponses = new Map<string, { result: string; error?: string }>();

  // 第一遍：收集 tool 响应
  for (const msg of rawMessages) {
    if (msg.type === "tool" && msg.tool_call_id) {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
          ? msg.content.map((c) => c.text || "").join("")
          : "";
      toolResponses.set(msg.tool_call_id, { result: content });
    }
  }

  // 第二遍：格式化消息
  for (const msg of rawMessages) {
    // Skip system messages and tool messages (tool responses are attached to AI messages)
    if (msg.type === "system" || msg.type === "tool") continue;

    // Map message types to UI roles
    let role: "user" | "assistant" = "assistant";
    if (msg.type === "human") {
      role = "user";
    } else if (msg.type === "ai") {
      role = "assistant";
    }

    // Extract content
    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((c: { text?: string }) => c.text || "")
        .join("");
    }

    // 🚫 只过滤纯内部消息（Supervisor 路由决策）
    if (msg.type === "ai" && content) {
      // 检测 Supervisor 的路由决策
      const isSupervisorRoute =
        content.trim().startsWith("{") && content.includes('"next"');

      // 如果是纯内部消息，跳过
      if (isSupervisorRoute) {
        continue;
      }
    }

    // 注意：Architect 消息已经被后端用 <architectPlan> 标签包裹
    // 前端直接通过标签识别，不需要额外处理

    // 处理 tool calls（仅 AI 消息）
    let toolCalls: ToolCall[] | undefined;
    if (msg.type === "ai" && msg.toolCalls && msg.toolCalls.length > 0) {
      toolCalls = msg.toolCalls.map((tc) => {
        const toolCallId = tc.id || `tc-${Date.now()}`;
        const response = toolResponses.get(toolCallId);
        return {
          id: toolCallId,
          name: tc.name,
          args: tc.args || {},
          status: response ? ("success" as const) : ("pending" as const),
          result: response?.result,
          error: response?.error,
        };
      });
    }

    // 只有有内容或有 tool calls 的消息才显示
    if (content || (toolCalls && toolCalls.length > 0)) {
      const hasArtifact = content.includes("<boltArtifact");
      formattedMessages.push({
        id: msg.id || `msg-${formattedMessages.length}`,
        role,
        content,
        hasArtifact,
        toolCalls,
      });
    }
  }

  return formattedMessages;
}
