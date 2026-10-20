// components/unified-chat.tsx
"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { SplitPane, Pane } from "react-split-pane";
import { toast } from "sonner";
import "react-split-pane/styles.css";
import "@/app/split-pane.css";

// Hooks
import { useChat } from "@/hooks/use-chat";
import { useCanvas } from "@/hooks/use-canvas";
import { SANDBOX_ORIGIN } from "@/lib/sandbox-config";

// Components
import { type MCPConfig } from "@/components/mcp";
import { MessageItem, InputBar } from "@/components/chat";
import { GenerationStatusCard } from "@/components/chat/generation-status-card";
import { CanvasPanel, FullscreenPreview } from "@/components/canvas";
import { ErrorToast } from "@/components/canvas/error-toast";
import {
  useIsGenerating,
  useGenerationStore,
} from "@/stores/use-generation-store";

interface UnifiedChatProps {
  projectId?: string;
  threadId?: string;
  onThreadUpdate?: () => void;
  initialMessage?: string;
  initialImages?: { dataUrl: string; mime_type: string }[];
}

export function UnifiedChat({
  projectId,
  threadId,
  onThreadUpdate,
  initialMessage,
  initialImages,
}: UnifiedChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 🔥 获取生成状态
  const isGenerating = useIsGenerating();

  // 保留 onThreadUpdate 参数以供将来使用
  void onThreadUpdate;

  // MCP configuration state
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // Model selection state with localStorage persistence
  // 🔧 修复：在初始化时直接从 localStorage 读取，避免时序问题
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem("selectedModel");
      return !savedModel || savedModel === "qwen-plus"
        ? "qwen3.7-flash-2026-07-15"
        : savedModel;
    }
    return "qwen3.7-flash-2026-07-15";
  });

  // Persist model selection to localStorage
  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  // Sandbox state
  const [isSandboxReady, setIsSandboxReady] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCanvasVisible, setIsCanvasVisible] = useState(false);

  // Chat hook - 先初始化，回调稍后通过 ref 设置
  const chatCallbacksRef = useRef<{
    onArtifactDetected?: (content: string) => void;
    onSaved?: () => void;
    onStreamStart?: () => void;
    onStreamComplete?: (content: string) => void;
    onError?: () => void;
    onTitleUpdate?: (threadId: string, title: string) => void;
  }>({});

  const chat = useChat({
    projectId,
    threadId,
    mcpConfigId: selectedMcpId,
    model: selectedModel,
    onArtifactDetected: (content) =>
      chatCallbacksRef.current.onArtifactDetected?.(content),
    onSaved: () => chatCallbacksRef.current.onSaved?.(),
    onStreamStart: () => chatCallbacksRef.current.onStreamStart?.(),
    onStreamComplete: (content) =>
      chatCallbacksRef.current.onStreamComplete?.(content),
    onError: () => chatCallbacksRef.current.onError?.(),
    onTitleUpdate: (threadId, title) =>
      chatCallbacksRef.current.onTitleUpdate?.(threadId, title),
  });

  // Canvas hook - 传入 messages 用于实时监听
  const canvas = useCanvas({ threadId, messages: chat.messages });
  const latestArtifactMessageId = useMemo(
    () =>
      [...chat.messages]
        .reverse()
        .find((message) =>
          message.role === "assistant" && message.content.includes("<boltArtifact"),
        )?.id,
    [chat.messages],
  );
  const latestVersionNumber =
    canvas.selectedVersion ??
    (canvas.versions.length > 0
      ? Math.max(...canvas.versions.map((version) => version.versionNumber))
      : undefined);

  // 用 ref 跟踪是否已经处理过 initialMessage
  const initialMessageSentRef = useRef(false);
  const sendInitialMessage = chat.sendMessage;

  // 切换项目时清理上一项目的进度。该 effect 必须先于首条消息发送，
  // 否则空历史记录的异步渲染会把刚启动的意图识别状态重置掉。
  useEffect(() => {
    useGenerationStore.getState().reset();
  }, [projectId]);

  // 新项目创建完成后，直接发送首页提交的原始需求。
  // 不再先写入输入框再依赖延时回调，避免页面切换时回调捕获到旧状态。
  useEffect(() => {
    const hasInitialContent =
      Boolean(initialMessage?.trim()) || Boolean(initialImages?.length);
    if (hasInitialContent && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      void sendInitialMessage({
        message: initialMessage || "",
        images: initialImages || [],
      });
    }
  }, [initialMessage, initialImages, sendInitialMessage]);

  // 设置 chat 回调（依赖 canvas）
  useEffect(() => {
    chatCallbacksRef.current = {
      onArtifactDetected: (content: string) => {
        // 首次检测到代码时，创建乐观版本用于展示代码生成过程
        if (!canvas.selectedVersion || canvas.selectedVersion === 0) {
          console.log("[UnifiedChat] 检测到代码生成，创建乐观版本");
          canvas.createOptimisticVersion();
        }

        // 启用生成模式，允许 messages 监听
        canvas.setIsGenerating(true);

        // 确保在更新代码前禁止沙箱渲染
        canvas.setShouldSendToSandbox(false);

        // 使用合并逻辑，保留未修改的文件
        canvas.mergeAndSetGeneratedCode(content);
      },
      onStreamStart: () => {
        console.log("[UnifiedChat] 流式响应开始");
        // 启用生成模式
        canvas.setIsGenerating(true);
        canvas.setShouldSendToSandbox(false);
      },
      onSaved: async () => {
        try {
          await canvas.refreshVersionList();
          canvas.setShouldSendToSandbox(true);
          toast.success("代码已生成、保存并同步预览");
        } catch (error) {
          console.error("[UnifiedChat] 刷新已保存版本失败:", error);
          toast.error("代码已保存，但刷新预览失败，请手动刷新页面");
        } finally {
          canvas.setIsGenerating(false);
        }
      },
      onStreamComplete: () => {
        canvas.setIsGenerating(false);
      },
      onError: () => {
        canvas.setIsGenerating(false);
        canvas.setShouldSendToSandbox(false);
      },
      onTitleUpdate: (threadId: string, title: string) => {
        console.log("[UnifiedChat] 🏷️ 标题已更新:", { threadId, title });
        // 触发父组件的 onThreadUpdate，刷新 sidebar 的 threads 列表
        if (onThreadUpdate) {
          onThreadUpdate();
        }
      },
    };
  }, [canvas, threadId, onThreadUpdate]);

  // 全屏切换处理
  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((prev) => {
      const nextFullscreen = !prev;
      // 进入全屏时，确保可以发送文件到沙箱
      if (nextFullscreen) {
        // 重置沙箱状态，因为全屏会使用新的 iframe
        setIsSandboxReady(false);
        canvas.setShouldSendToSandbox(true);
        console.log("[全屏] 进入全屏模式，重置沙箱状态，等待就绪");
      }
      return nextFullscreen;
    });
  }, [canvas]);

  const handleFullscreenClose = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // 处理沙箱重置（刷新时调用）
  const handleSandboxReset = useCallback(() => {
    console.log("[沙箱重置] 重置沙箱状态");
    setIsSandboxReady(false);
    canvas.setShouldSendToSandbox(true);
  }, [canvas]);

  // 处理错误修复
  const handleFixError = useCallback(() => {
    if (!sandboxError) return;

    console.log("[错误修复] 开始修复错误:", sandboxError);

    // 构建修复提示消息（简化版：只发送错误信息，代码上下文由后端自动获取）
    const fixPrompt = `代码运行出现错误，请帮我修复：

\`\`\`
${sandboxError}
\`\`\`

请分析错误原因并修复代码。`;

    // 设置输入内容并发送
    chat.setInput(fixPrompt);

    // 短暂延迟确保输入已设置
    setTimeout(() => {
      chat.sendMessage();
    }, 100);

    // 清除错误状态（因为已经开始处理）
    setSandboxError(null);
  }, [sandboxError, chat]);

  // 处理关闭错误提示
  const handleDismissError = useCallback(() => {
    setSandboxError(null);
  }, []);

  // 全屏时监听沙箱就绪并发送文件
  useEffect(() => {
    console.log("[全屏-监听] 状态变化:", {
      isFullscreen,
      isSandboxReady,
      hasArtifact: !!canvas.artifact,
      hasIframe: !!iframeRef.current,
      shouldSend: canvas.shouldSendToSandbox,
    });

    // 必须确保沙箱已就绪才发送
    if (!isSandboxReady) {
      console.log("[全屏-监听] 沙箱未就绪，等待中...");
      return;
    }

    if (
      isFullscreen &&
      canvas.artifact &&
      iframeRef.current &&
      canvas.shouldSendToSandbox
    ) {
      console.log("[全屏] 所有条件满足，发送文件到沙箱");
      canvas.sendFilesToSandbox(iframeRef);
    }
  }, [
    isFullscreen,
    isSandboxReady,
    canvas.artifact,
    canvas.shouldSendToSandbox,
    canvas.sendFilesToSandbox,
  ]);

  // ESC 键退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Sandbox message listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== SANDBOX_ORIGIN) return;
      if (![1, 2].includes(event.data?.protocolVersion)) return;

      const { type, payload } = event.data || {};

      switch (type) {
        case "IFRAME_LOADED":
          setIsSandboxReady(true);
          setSandboxError(null);
          console.log("沙箱已就绪");
          break;

        case "artifacts-success":
          setSandboxError(null);
          console.log("渲染成功");
          break;

        case "artifacts-error":
          setSandboxError(payload?.errorMessage || "渲染失败");
          console.error("渲染失败:", payload?.errorMessage);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Scroll to bottom when messages change (only if user is not scrolling)
  // 🔥 生成中强制滚动到底部
  useEffect(() => {
    if (!isUserScrolling || isGenerating) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages, isUserScrolling, isGenerating]);

  // Detect user scrolling
  // 🔥 生成中禁用手动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // 生成中禁用手动滚动检测
      if (isGenerating) {
        setIsUserScrolling(false);
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

      // If user scrolls to bottom, resume auto-scroll
      if (isAtBottom) {
        setIsUserScrolling(false);
      } else if (scrollTop < scrollHeight - clientHeight - 50) {
        // User scrolled up
        setIsUserScrolling(true);
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isGenerating]);

  // Fetch MCP configurations
  const fetchMcpConfigs = useCallback(async () => {
    setIsMcpLoading(true);
    try {
      const response = await fetch("/api/mcp/configs");
      if (response.ok) {
        const data = await response.json();
        setMcpConfigs(data.configs || []);
      }
    } catch (error) {
      console.error("Failed to fetch MCP configs:", error);
    } finally {
      setIsMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMcpConfigs();
  }, [fetchMcpConfigs]);

  // Fix for fast dragging issue using props instead of global listeners
  const handleDragStarted = useCallback(() => {
    document.body.classList.add("dragging");
    // Ensure iframe interaction is disabled during drag
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = "none";
    }
  }, []);

  const handleDragFinished = useCallback(() => {
    document.body.classList.remove("dragging");
    // Re-enable iframe interaction
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = "auto";
    }
  }, []);

  // Canvas visibility state
  // 🔥 FIX: Remove duplicate declaration
  // const [isCanvasVisible, setIsCanvasVisible] = useState(false);

  // Auto-show canvas when code is generated or versions exist
  useEffect(() => {
    // 检查 artifact 解析结果是否真的包含文件
    const hasFiles =
      canvas.artifact &&
      canvas.artifact.files &&
      canvas.artifact.files.length > 0;
    const hasVersions = canvas.versions && canvas.versions.length > 0;

    // 只有当真正有文件内容或有版本历史时才显示
    if (hasFiles || hasVersions) {
      console.log("[UnifiedChat] 自动显示 Canvas:", { hasFiles, hasVersions });
      setIsCanvasVisible(true);
    }
  }, [canvas.artifact, canvas.versions]);

  return (
    <div className="h-full bg-background">
      <SplitPane
        // 兼容性修复：react-split-pane 类型定义可能不包含 split 属性，但组件本身支持
        // @ts-expect-error react-split-pane props compatibility
        split="vertical"
        // 🔥 如果 canvas 不可见，设置为单面板模式 (通过 max/min size 控制)
        primary="first"
        minSize={isCanvasVisible ? 300 : "100%"}
        maxSize={isCanvasVisible ? "70%" : "100%"}
        defaultSize={isCanvasVisible ? "40%" : "100%"}
        size={isCanvasVisible ? "40%" : "100%"} // 🔥 强制控制大小，确保状态更新时触发重新渲染
        allowResize={isCanvasVisible}
        pane2Style={isCanvasVisible ? {} : { display: "none", width: 0 }} // 🔥 强制隐藏第二个面板
        onDragStarted={handleDragStarted}
        onDragFinished={handleDragFinished}
      >
        {/* Left: Chat Area */}
        <Pane
          className="h-full"
          style={isCanvasVisible ? {} : { width: "100%" }} // 🔥 强制占满宽度
        >
          <div className="flex h-full flex-col border-r border-border">
            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar"
              aria-label="项目活动"
            >
              {chat.messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  messages={chat.messages}
                  threadId={threadId || ""}
                  onMessageDeleted={async () => {
                    // 🔥 暂时注释掉刷新逻辑，待优化后再启用
                    // await chat.reloadHistory();
                    // await canvas.refreshVersionList();
                    console.log("[UnifiedChat] 消息删除回调（功能已禁用）");
                  }}
                  onRegenerate={(messageId) => {
                    chat.regenerateFromMessage(messageId);
                  }}
                  versionNumber={
                    message.id === latestArtifactMessageId
                      ? latestVersionNumber
                      : undefined
                  }
                  onViewChanges={
                    message.id === latestArtifactMessageId
                      ? () => {
                          setIsCanvasVisible(true);
                          canvas.setActiveTab("code");
                        }
                      : undefined
                  }
                  onUndo={
                    message.id === latestArtifactMessageId &&
                    latestVersionNumber &&
                    latestVersionNumber > 1
                      ? () => {
                          setIsCanvasVisible(true);
                          canvas.selectVersion(latestVersionNumber - 1);
                        }
                      : undefined
                  }
                />
              ))}

              {/* 🔥 生成状态卡片 */}
              <GenerationStatusCard />

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <InputBar
              ref={inputRef}
              value={chat.input}
              onChange={chat.setInput}
              onSubmit={chat.sendMessage}
              onStop={chat.stop}
              isLoading={chat.isLoading}
              isCanvasMode={true}
              images={chat.images}
              onImagesChange={chat.setImages}
              mcpConfigs={mcpConfigs}
              selectedMcpId={selectedMcpId}
              isMcpLoading={isMcpLoading}
              onMcpSelect={setSelectedMcpId}
              onMcpRefresh={fetchMcpConfigs}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              isCanvasVisible={isCanvasVisible}
              onToggleCanvas={() => {
                console.log(
                  "[UnifiedChat] 切换 Canvas 显示状态:",
                  !isCanvasVisible,
                );
                setIsCanvasVisible(!isCanvasVisible);
              }}
            />
          </div>
        </Pane>

        {/* Right: Canvas Panel (Always visible) */}
        <Pane minSize="300px">
          <div className="flex h-full flex-col">
            <CanvasPanel
              projectId={projectId}
              canvas={canvas}
              iframeRef={iframeRef}
              isSandboxReady={isSandboxReady}
              sandboxError={sandboxError}
              onFullscreenToggle={handleFullscreenToggle}
              onSandboxReset={handleSandboxReset}
              isFullscreen={isFullscreen}
            />
          </div>
        </Pane>
      </SplitPane>

      {/* Fullscreen Preview */}
      {isFullscreen && (
        <FullscreenPreview
          ref={iframeRef}
          isSandboxReady={isSandboxReady}
          sandboxError={sandboxError}
          onClose={handleFullscreenClose}
        />
      )}

      {/* Error Toast */}
      <ErrorToast
        error={sandboxError}
        onFix={handleFixError}
        onDismiss={handleDismissError}
      />
    </div>
  );
}
