import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { MessageBuffer } from "@/lib/message-filter";
import {
  useGenerationStore,
  GenerationStage,
} from "@/stores/use-generation-store";
import { ERROR_CONFIG } from "@/lib/agent/config";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasArtifact?: boolean;
  toolCalls?: ToolCall[];
  images?: Array<{
    dataUrl: string;
    mime_type: string;
  }>;
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
  /** 当前项目 */
  projectId?: string;
  /** MCP 配置 ID */
  mcpConfigId?: string | null;
  /** 选中的模型名称 */
  model?: string;
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
  /** 标题更新时的回调 */
  onTitleUpdate?: (threadId: string, title: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const {
    api = "/api/agent/stream",
    threadId,
    projectId,
    mcpConfigId,
    model,
    onArtifactDetected,
    onSaved,
    onStreamStart,
    onStreamComplete,
    onToolCall,
    onError,
    onTitleUpdate,
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<
    Array<{ dataUrl: string; mime_type: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  // 增加 history 加载状态，分离出页面级 loading
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 使用 ref 存储回调，避免依赖变化导致死循环
  const onArtifactDetectedRef = useRef(onArtifactDetected);
  const onSavedRef = useRef(onSaved);
  const onStreamStartRef = useRef(onStreamStart);
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onToolCallRef = useRef(onToolCall);
  const onErrorRef = useRef(onError);
  const onTitleUpdateRef = useRef(onTitleUpdate);

  // 同步更新 ref
  useEffect(() => {
    onArtifactDetectedRef.current = onArtifactDetected;
    onSavedRef.current = onSaved;
    onStreamStartRef.current = onStreamStart;
    onStreamCompleteRef.current = onStreamComplete;
    onToolCallRef.current = onToolCall;
    onErrorRef.current = onError;
    onTitleUpdateRef.current = onTitleUpdate;
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
      // 使用专门的历史加载状态，不影响对话输入框的 loading
      setIsHistoryLoading(true);
      try {
        const response = await fetch(`/api/agent/history/${threadId}`);
        if (response.ok) {
          const data = await response.json();
          const formattedMessages = formatMessagesFromHistory(
            data.messages || [],
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
        setIsHistoryLoading(false);
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
      images: images.length > 0 ? images : undefined,
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

    // Build payloadMessage: 始终发送字符串格式给后端
    const payloadMessage: string = userMessage.content;

    let assistantContent = "";

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payloadMessage,
          images: currentImages,
          threadId,
          projectId,
          generationRequestId: crypto.randomUUID(),
          mcpConfigId,
          model,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        toolCalls: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      // 🔥 启动生成状态：进入 Thinking 阶段（而不是直接进入 Architect）
      useGenerationStore.getState().startThinking(assistantMessage.id);
      // 流式响应开始，移除"思考中"状态
      setIsLoading(false);

      // 创建消息缓冲器，处理流式传输时标签被拆分的问题
      const messageBuffer = new MessageBuffer();

      // 标记是否需要为 Coder 创建新消息
      let needNewMessageForCoder = false;

      // Process streaming response
      let totalChunks = 0;
      let totalBytes = 0;
      console.log("[useChat] 开始接收流式响应");

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          totalChunks++;
          totalBytes += value.length;
        }

        if (done) {
          console.log("[useChat] 流式响应结束", {
            totalChunks,
            totalBytes,
            contentLength: assistantContent.length,
            hasBoltArtifact: assistantContent.includes("<boltArtifact"),
            hasBoltArtifactEnd: assistantContent.includes("</boltArtifact>"),
          });
          break;
        }

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "content" || data.content) {
                const content = data.content || "";

                // 🔥 如果是 Coder 阶段的第一个内容，创建新消息
                if (needNewMessageForCoder && content) {
                  console.log(
                    "[useChat] Coder 开始输出，创建新消息:",
                    content.substring(0, 20),
                  );

                  const newAssistantMessage: Message = {
                    id: (Date.now() + 2).toString(),
                    role: "assistant",
                    content: "",
                    toolCalls: [],
                  };

                  setMessages((prev) => [...prev, newAssistantMessage]);

                  // 更新当前消息引用和内容
                  assistantMessage = newAssistantMessage;
                  assistantContent = "";
                  needNewMessageForCoder = false;
                }

                // 使用消息缓冲器判断是否应该显示
                const shouldShow = messageBuffer.append(content, data.metadata);

                // 如果需要过滤，跳过这条消息（不累积到 assistantContent）
                if (!shouldShow) {
                  console.log(
                    "[useChat] 过滤 chunk:",
                    content.substring(0, 20),
                  );
                  continue;
                }

                // 累积显示的内容
                assistantContent += content;

                // 🔥 检测是否进入 Architect 阶段
                const currentStage = useGenerationStore.getState().stage;
                if (
                  assistantContent.includes("<architectPlan") &&
                  currentStage !== GenerationStage.GENERATING
                ) {
                  console.log("[useChat] 检测到 Architect 标签，切换状态");
                  useGenerationStore
                    .getState()
                    .startGenerating(assistantMessage.id);
                }

                const hasArtifact = assistantContent.includes("<boltArtifact");

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: assistantContent,
                          hasArtifact,
                        }
                      : msg,
                  ),
                );

                if (hasArtifact && onArtifactDetectedRef.current) {
                  onArtifactDetectedRef.current(assistantContent);
                }
              } else if (data.type === "architect_complete") {
                // ARCHITECT 完成
                console.log("[useChat] ✅ 检测到 ARCHITECT 完成事件", {
                  当前消息数: messages.length,
                  当前assistant内容长度: assistantContent.length,
                  包含architectPlan:
                    assistantContent.includes("</architectPlan>"),
                });

                // 🔥 确保保持在生成状态
                useGenerationStore.getState().startGenerating();

                // ⚠️ 不要立即创建新消息和重置 assistantContent
                // 等待 Coder 真正开始输出内容时（下一个 content chunk）再创建
                // 这样可以避免 Architect 消息被"截断"显示
                needNewMessageForCoder = true;

                console.log(
                  "[useChat] Architect 完成，等待 Coder 输出时创建新消息",
                );

                // 继续处理后续的 content chunks
                continue;
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
                      : msg,
                  ),
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
                              : tc,
                          ),
                        }
                      : msg,
                  ),
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
                              : tc,
                          ),
                        }
                      : msg,
                  ),
                );
              } else if (data.type === "title_update") {
                // 标题更新事件
                console.log("[useChat] 🏷️ 收到标题更新事件:", {
                  threadId: data.threadId,
                  newTitle: data.title,
                });

                if (onTitleUpdateRef.current) {
                  onTitleUpdateRef.current(data.threadId, data.title);
                }
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
      // 注意：即使 assistantContent 为空也要触发，因为可能是 architect 完成后创建的新消息
      // artifact 内容可能在前一条消息中

      // 检查内容完整性
      if (
        assistantContent.includes("<boltArtifact") &&
        !assistantContent.includes("</boltArtifact>")
      ) {
        console.error(
          "[useChat] ⚠️ 警告：检测到未闭合的 <boltArtifact> 标签！",
        );
        console.error("[useChat] 内容长度:", assistantContent.length);
        console.error("[useChat] 内容末尾:", assistantContent.slice(-300));
        console.error(
          "[useChat] 总接收: chunks=",
          totalChunks,
          "bytes=",
          totalBytes,
        );
      }

      if (onStreamCompleteRef.current) {
        onStreamCompleteRef.current(assistantContent || "");
      }

      // � 结束生成状态
      useGenerationStore.getState().complete();

      // �🔧 修复：强制更新最后一次消息状态，确保 React 渲染最新内容
      // 这解决了 architectPlan 结束标签到达后状态未更新的问题
      if (assistantContent) {
        const hasArtifact = assistantContent.includes("<boltArtifact");
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  content: assistantContent,
                  hasArtifact,
                }
              : msg,
          ),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // 请求被取消，重置状态
        console.log("[useChat] 请求被用户取消");
        useGenerationStore.getState().reset();
        return;
      }

      const error = err instanceof Error ? err : new Error("未知错误");
      console.error("[useChat] 发生错误:", error);
      console.error("[useChat] 错误详情:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        assistantContentLength: assistantContent.length,
        messageCount: messages.length,
      });

      setError(error);

      // 根据错误类型提供更友好的提示
      let errorMessage: string = ERROR_CONFIG.DEFAULT_MESSAGE;
      if (error.message.includes("timeout") || error.message.includes("超时")) {
        errorMessage = ERROR_CONFIG.TIMEOUT_MESSAGE;
      } else if (
        error.message.includes("network") ||
        error.message.includes("网络")
      ) {
        errorMessage = ERROR_CONFIG.NETWORK_MESSAGE;
      } else if (error.message.includes("abort")) {
        errorMessage = ERROR_CONFIG.ABORT_MESSAGE;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: errorMessage,
        },
      ]);

      toast.error(errorMessage);
      onErrorRef.current?.(error);
      // 🔥 错误时重置生成状态
      useGenerationStore.getState().reset();
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [
    api,
    input,
    isLoading,
    threadId,
    projectId,
    mcpConfigId,
    model,
    images,
    messages.length,
  ]);

  /** 表单提交处理 */
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      sendMessage();
    },
    [sendMessage],
  );

  /** 停止当前请求 */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    // 🔥 停止时重置生成状态
    useGenerationStore.getState().reset();
  }, []);

  /** 清空消息记录 */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /** 强制重新加载历史消息 */
  const reloadHistory = useCallback(async () => {
    if (!threadId) return;

    // 重置加载标记，强制重新加载
    historyLoadedRef.current = null;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/agent/history/${threadId}`);
      if (response.ok) {
        const data = await response.json();
        const formattedMessages = formatMessagesFromHistory(
          data.messages || [],
        );
        setMessages(formattedMessages);
        historyLoadedRef.current = threadId;
      }
    } catch (err) {
      console.error("Failed to reload history:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  /** 重新生成消息：从 LangGraph 检查点重新执行，不重新发送消息 */
  const regenerateFromMessage = useCallback(
    async (messageId: string) => {
      if (!threadId) return;

      // 从消息 ID 中提取索引
      const match = messageId.match(/^msg-(\d+)$/);
      if (!match) {
        toast.error("无效的消息 ID");
        return;
      }
      const messageIndex = parseInt(match[1], 10);

      // 查找目标消息
      const targetMessage = messages[messageIndex];
      if (!targetMessage || targetMessage.role !== "user") {
        toast.error("只能重新生成用户消息");
        return;
      }

      try {
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

        // 🔥 调用新的 regenerate API，它会：
        // 1. 删除该消息之后的所有消息和版本
        // 2. 从 LangGraph 检查点重新执行
        // 3. 不会重新发送用户消息
        const response = await fetch("/api/agent/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            messageId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        // 先重新加载历史消息，显示删除后的状态
        await reloadHistory();

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        // 使用消息缓冲区来过滤重复消息
        const messageBuffer = new MessageBuffer();
        let assistantContent = "";
        let assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "",
          toolCalls: [],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // 🔥 启动生成状态：进入 Thinking 阶段
        useGenerationStore.getState().startThinking(assistantMessage.id);
        setIsLoading(false);

        // 标记：是否需要为 Coder 创建新消息
        let needNewMessageForCoder = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk
            .split("\n")
            .filter((line) => line.trim().startsWith("data:"));

          for (const line of lines) {
            const jsonStr = line.replace(/^data:\s*/, "");
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);

              if (data.type === "content") {
                // 如果需要为 Coder 创建新消息，现在创建
                if (needNewMessageForCoder && data.content) {
                  console.log("[useChat] 🔥 检测到 Coder 开始输出，创建新消息");
                  assistantMessage = {
                    id: (Date.now() + 2).toString(),
                    role: "assistant",
                    content: "",
                    toolCalls: [],
                  };
                  assistantContent = "";
                  setMessages((prev) => [...prev, assistantMessage]);
                  needNewMessageForCoder = false;
                }

                // 使用缓冲区过滤
                const shouldShow = messageBuffer.append(
                  data.content,
                  data.metadata,
                );
                if (!shouldShow) {
                  continue;
                }

                assistantContent += data.content;

                // 🔥 检测是否进入 Architect 阶段
                const currentStage = useGenerationStore.getState().stage;
                if (
                  assistantContent.includes("<architectPlan") &&
                  currentStage !== GenerationStage.GENERATING
                ) {
                  console.log("[useChat] 检测到 Architect 标签，切换状态");
                  useGenerationStore
                    .getState()
                    .startGenerating(assistantMessage.id);
                }

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? { ...msg, content: assistantContent }
                      : msg,
                  ),
                );

                const hasArtifact = assistantContent.includes("<boltArtifact");
                if (hasArtifact && onArtifactDetectedRef.current) {
                  onArtifactDetectedRef.current(assistantContent);
                }
              } else if (data.type === "architect_complete") {
                useGenerationStore.getState().startGenerating();
                needNewMessageForCoder = true;
              } else if (data.type === "tool_start") {
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
                      : msg,
                  ),
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
                              : tc,
                          ),
                        }
                      : msg,
                  ),
                );
              } else if (data.type === "error") {
                setError(new Error(data.error));
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e, jsonStr);
            }
          }
        }

        // 🔥 完成后总是调用 onStreamComplete（不管是否检测到 end 事件）
        if (onStreamCompleteRef.current) {
          onStreamCompleteRef.current(assistantContent);
        }

        setIsLoading(false);
        toast.success("重新生成成功");
      } catch (error) {
        console.error("重新生成失败:", error);
        toast.error("重新生成失败，请重试");
        setIsLoading(false);
        setError(error instanceof Error ? error : new Error("Unknown error"));
      }
    },
    [
      threadId,
      messages,
      reloadHistory,
      api,
      mcpConfigId,
      model,
      onStreamStartRef,
      abortControllerRef,
      onArtifactDetectedRef,
      onToolCallRef,
      onStreamCompleteRef,
    ],
  );

  return {
    // 状态
    messages,
    input,
    images,
    isLoading,
    isHistoryLoading, // 暴露新的状态
    error,
    threadId,

    // 输入控制
    setInput,
    setImages,
    handleSubmit,

    // 消息操作
    sendMessage,
    clearMessages,
    reloadHistory,
    regenerateFromMessage,

    // 请求控制
    stop,
  };
}

// 原始消息类型定义
interface RawMessage {
  id?: string;
  type: string;
  content:
    | string
    | Array<{
        type?: string;
        text?: string;
        source_type?: string;
        data?: string;
      }>;
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

    // Extract content and images
    let content = "";
    let images: Array<{ dataUrl: string; mime_type: string }> | undefined;

    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // 提取文本内容
      const textParts = msg.content
        .filter((c) => c.type === "text" || c.text)
        .map((c) => c.text || "")
        .filter(Boolean);
      content = textParts.join("");

      // 提取图片内容
      const imageParts = msg.content.filter(
        (c) => c.type === "image" && c.source_type === "base64" && c.data,
      );

      if (imageParts.length > 0) {
        images = imageParts.map((img) => ({
          dataUrl: `data:image/png;base64,${img.data}`,
          mime_type: "image/png",
        }));
      }
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
    if (content || images || (toolCalls && toolCalls.length > 0)) {
      const hasArtifact = content.includes("<boltArtifact");
      formattedMessages.push({
        id: msg.id || `msg-${formattedMessages.length}`,
        role,
        content,
        hasArtifact,
        toolCalls,
        images,
      });
    }
  }

  return formattedMessages;
}
