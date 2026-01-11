// components/unified-chat.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { SplitPane, Pane } from "react-split-pane";
import { toast } from "sonner";
import "react-split-pane/styles.css";
import "@/app/split-pane.css";

// Hooks
import { useChat } from "@/hooks/use-chat";
import { useCanvas } from "@/hooks/use-canvas";

// Components
import { type MCPConfig } from "@/components/mcp";
import { MessageItem, InputBar } from "@/components/chat";
import { GenerationStatusCard } from "@/components/chat/generation-status-card";
import { CanvasPanel, FullscreenPreview } from "@/components/canvas";
import {
  useIsGenerating,
  useGenerationStore,
} from "@/stores/use-generation-store";

interface UnifiedChatProps {
  threadId?: string;
  onThreadUpdate?: () => void;
  initialMessage?: string;
  initialImages?: { dataUrl: string; mime_type: string }[];
}

export function UnifiedChat({
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
      return localStorage.getItem("selectedModel") || "qwen-plus";
    }
    return "qwen-plus";
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
    onStreamStart?: () => void;
    onStreamComplete?: (content: string) => void;
    onTitleUpdate?: (threadId: string, title: string) => void;
  }>({});

  const chat = useChat({
    threadId,
    mcpConfigId: selectedMcpId,
    model: selectedModel,
    onArtifactDetected: (content) =>
      chatCallbacksRef.current.onArtifactDetected?.(content),
    onStreamStart: () => chatCallbacksRef.current.onStreamStart?.(),
    onStreamComplete: (content) =>
      chatCallbacksRef.current.onStreamComplete?.(content),
    onTitleUpdate: (threadId, title) =>
      chatCallbacksRef.current.onTitleUpdate?.(threadId, title),
  });

  // Canvas hook - 传入 messages 用于实时监听
  const canvas = useCanvas({ threadId, messages: chat.messages });

  // 用 ref 跟踪是否已经处理过 initialMessage
  const initialMessageSentRef = useRef(false);
  const pendingAutoSendRef = useRef(false);

  // 第一步：接收 initialMessage 和 initialImages，设置输入框和图片
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      pendingAutoSendRef.current = true;
      chat.setInput(initialMessage);
      // 如果有初始图片，也设置到 chat 中
      if (initialImages && initialImages.length > 0) {
        chat.setImages(initialImages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, initialImages]);

  // 第二步：监听 chat.input 变化，当输入框被填充后自动发送
  useEffect(() => {
    if (pendingAutoSendRef.current && chat.input && !chat.isLoading) {
      pendingAutoSendRef.current = false;

      // 短暂延迟确保历史加载完成
      const timer = setTimeout(() => {
        chat.sendMessage();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [chat.input, chat.isLoading, chat.messages.length, chat.sendMessage]);

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
      onStreamComplete: async (content: string) => {
        // 流式响应完成
        if (canvas.artifact && canvas.artifact.files.length > 0) {
          console.log("[UnifiedChat] 代码生成完成，准备保存到后端", {
            filesCount: canvas.artifact.files.length,
            contentLength: content.length,
          });

          // 🛡️ 完整性校验
          const hasClosingTag = content.includes("</boltArtifact>");
          const hasEntryFile = canvas.artifact.files.some(
            (f) =>
              f.path === "App.tsx" ||
              f.path === "src/App.tsx" ||
              f.path.endsWith("/App.tsx")
          );

          if (!hasClosingTag) {
            console.error("[UnifiedChat] ❌ 生成不完整：缺少闭合标签");
            toast.warning("生成中断，内容不完整");
            canvas.setIsGenerating(false);
            return;
          }

          if (!hasEntryFile) {
            console.error("[UnifiedChat] ❌ 生成不完整：缺少入口文件 App.tsx");
            toast.warning("生成结果缺失关键文件，可能无法运行");
            // 不强制中断，允许尝试加载
          }

          // 🚀 后端已接管自动保存逻辑 (Server-Side Auto-Save)
          // 前端只需刷新版本列表即可
          console.log("[UnifiedChat] 生成完成，后端应已自动保存，准备刷新版本列表");
          
          try {
            // 短暂延迟确保后端事务完成
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 刷新版本列表，获取后端保存的最新版本
            await canvas.refreshVersionList();
            console.log("[UnifiedChat] 版本列表刷新完成");

            // 生成完成，禁用 messages 监听（切换为查看历史模式）
            canvas.setIsGenerating(false);

            // 允许发送到沙箱渲染
            canvas.setShouldSendToSandbox(true);
            
            toast.success("代码已生成并保存");
          } catch (error) {
            console.error("[UnifiedChat] 刷新版本列表失败:", error);
            canvas.setIsGenerating(false);
            toast.error("刷新版本失败，请手动刷新页面");
          }
        } else {
          // 没有代码生成，直接禁用生成模式
          canvas.setIsGenerating(false);
        }
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

  // 🔥 修复：初始加载时重置生成状态
  // 避免上次会话遗留的状态导致“正在生成内容”卡片错误显示
  useEffect(() => {
    // 只有当没有消息或者最新消息不是 assistant 时，才可能是异常状态
    if (chat.messages.length === 0) {
      useGenerationStore.getState().reset();
    }
  }, [chat.messages.length]);

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
                />
              ))}

              {/* 🔥 生成状态卡片 */}
              <GenerationStatusCard />

              {chat.isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      思考中...
                    </span>
                  </div>
                </div>
              )}

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
                  !isCanvasVisible
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
    </div>
  );
}
