"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasArtifact?: boolean;
  toolCalls?: ToolCall[];
  agentSteps?: AgentStep[];
}

export interface AgentStep {
  id: string;
  agent: "supervisor" | "architect" | "coder" | "reviewer";
  status: "running" | "completed" | "error";
  message?: string;
  timestamp: number;
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

          // Check for artifacts in history and notify the last one
          const lastArtifactMsg = [...formattedMessages]
            .reverse()
            .find((msg) => msg.hasArtifact);
          if (lastArtifactMsg && onArtifactDetectedRef.current) {
            onArtifactDetectedRef.current(lastArtifactMsg.content);
          }
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
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
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

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
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
        agentSteps: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

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
                assistantContent += content;
                const hasArtifact = assistantContent.includes("<boltArtifact");

                // 检测内容变化，实时更新状态提示
                const contentType = analyzeContentType(assistantContent);

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: assistantContent,
                          hasArtifact,
                          // 基于内容实时更新状态提示
                          agentSteps: updateAgentStepsFromContent(
                            msg.agentSteps || [],
                            contentType
                          ),
                        }
                      : msg
                  )
                );

                if (hasArtifact && onArtifactDetectedRef.current) {
                  onArtifactDetectedRef.current(assistantContent);
                }
              } else if (data.type === "agent_start") {
                // 处理 agent 开始事件
                const agentStep: AgentStep = {
                  id: `${data.agent}-${Date.now()}`,
                  agent: data.agent,
                  status: "running",
                  message: data.message,
                  timestamp: Date.now(),
                };

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          agentSteps: [...(msg.agentSteps || []), agentStep],
                        }
                      : msg
                  )
                );
              } else if (data.type === "agent_end") {
                // 处理 agent 结束事件
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          agentSteps: msg.agentSteps?.map((step) =>
                            step.agent === data.agent &&
                            step.status === "running"
                              ? {
                                  ...step,
                                  status: "completed" as const,
                                  message: data.message,
                                }
                              : step
                          ),
                        }
                      : msg
                  )
                );
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
              } else if (data.type === "saved") {
                // 后端保存成功，触发回调刷新版本历史
                console.log("[useChat] 后端保存成功，触发 onSaved");
                onSavedRef.current?.();
              }
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
    isLoading,
    error,
    threadId,

    // 输入控制
    setInput,
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

    // 为历史数据重建 agentSteps 以保持UI一致性
    let agentSteps: AgentStep[] | undefined;
    if (msg.type === "ai" && content) {
      agentSteps = reconstructAgentSteps(content);
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
        agentSteps,
      });
    }
  }

  return formattedMessages;
}

// 从历史内容重建 agentSteps，用于保持UI状态一致性
function reconstructAgentSteps(content: string): AgentStep[] {
  const steps: AgentStep[] = [];
  const timestamp = Date.now();

  // 检查内容特征来推断曾经经历的步骤
  const hasArchitectPlan =
    content.includes("<architect_plan>") || content.includes("架构师");
  const hasCode = content.includes("<boltArtifact") || content.includes("代码");
  const hasReview =
    content.includes("<reviewer_result>") ||
    content.includes("审查") ||
    content.includes("APPROVE") ||
    content.includes("REJECT");

  // 重建步骤历史
  if (hasArchitectPlan || hasCode || hasReview) {
    // Supervisor 步骤
    steps.push({
      id: `supervisor-${timestamp}`,
      agent: "supervisor",
      status: "completed",
      message: "任务分析完成",
      timestamp: timestamp,
    });
  }

  if (hasArchitectPlan) {
    // Architect 步骤
    steps.push({
      id: `architect-${timestamp}`,
      agent: "architect",
      status: "completed",
      message: "架构设计完成",
      timestamp: timestamp + 1,
    });
  }

  if (hasCode) {
    // Coder 步骤
    steps.push({
      id: `coder-${timestamp}`,
      agent: "coder",
      status: "completed",
      message: "代码生成完成",
      timestamp: timestamp + 2,
    });
  }

  if (hasReview) {
    // Reviewer 步骤
    const isReviewComplete =
      content.includes("APPROVE") || content.includes("REJECT:");
    steps.push({
      id: `reviewer-${timestamp}`,
      agent: "reviewer",
      status: isReviewComplete ? "completed" : "running",
      message: isReviewComplete ? "代码审查完成" : "正在审查代码",
      timestamp: timestamp + 3,
    });
  }

  return steps;
}

// 分析内容类型，用于实时状态更新
function analyzeContentType(content: string): {
  hasArchitect: boolean;
  hasCoder: boolean;
  hasReviewer: boolean;
  isReviewComplete: boolean;
} {
  return {
    hasArchitect:
      content.includes("<architect_plan>") || content.includes("架构师"),
    hasCoder: content.includes("<boltArtifact") || content.includes("代码"),
    hasReviewer:
      content.includes("<reviewer_result>") ||
      content.includes("审查") ||
      content.includes("APPROVE") ||
      content.includes("REJECT"),
    isReviewComplete:
      content.includes("APPROVE") || content.includes("REJECT:"),
  };
}

// 根据内容实时更新 agentSteps
function updateAgentStepsFromContent(
  currentSteps: AgentStep[],
  contentType: any
): AgentStep[] {
  const steps = [...currentSteps];
  const timestamp = Date.now();

  // 如果还没有supervisor步骤且有任何内容，添加supervisor
  const hasSupervisor = steps.some((s) => s.agent === "supervisor");
  if (
    !hasSupervisor &&
    (contentType.hasArchitect ||
      contentType.hasCoder ||
      contentType.hasReviewer)
  ) {
    steps.unshift({
      id: `supervisor-${timestamp}`,
      agent: "supervisor",
      status: "completed",
      message: "任务分析完成",
      timestamp: timestamp - 3,
    });
  }

  // 如果有架构内容且没有architect步骤，添加architect
  const hasArchitect = steps.some((s) => s.agent === "architect");
  if (!hasArchitect && contentType.hasArchitect) {
    steps.push({
      id: `architect-${timestamp}`,
      agent: "architect",
      status: "completed",
      message: "架构设计完成",
      timestamp: timestamp - 2,
    });
  }

  // 如果有代码内容且没有coder步骤，添加coder
  const hasCoder = steps.some((s) => s.agent === "coder");
  if (!hasCoder && contentType.hasCoder) {
    steps.push({
      id: `coder-${timestamp}`,
      agent: "coder",
      status: "completed",
      message: "代码生成完成",
      timestamp: timestamp - 1,
    });
  }

  // 如果有审查内容，处理reviewer步骤
  if (contentType.hasReviewer) {
    const reviewerIndex = steps.findIndex((s) => s.agent === "reviewer");
    if (reviewerIndex === -1) {
      // 添加新的reviewer步骤
      steps.push({
        id: `reviewer-${timestamp}`,
        agent: "reviewer",
        status: contentType.isReviewComplete ? "completed" : "running",
        message: contentType.isReviewComplete ? "代码审查完成" : "正在审查代码",
        timestamp: timestamp,
      });
    } else {
      // 更新现有的reviewer步骤
      steps[reviewerIndex] = {
        ...steps[reviewerIndex],
        status: contentType.isReviewComplete ? "completed" : "running",
        message: contentType.isReviewComplete ? "代码审查完成" : "正在审查代码",
      };
    }
  }

  return steps;
}
