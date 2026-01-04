// components/unified-chat.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { SplitPane, Pane } from "react-split-pane";
import "react-split-pane/styles.css";

// Hooks
import { useChat } from "@/hooks/use-chat";
import { useCanvas } from "@/hooks/use-canvas";

// Components
import { type MCPConfig } from "@/components/mcp";
import { MessageItem, InputBar } from "@/components/chat";
import { CanvasPanel, FullscreenPreview } from "@/components/canvas";

interface UnifiedChatProps {
  threadId?: string;
  onThreadUpdate?: () => void;
}

export function UnifiedChat({ threadId, onThreadUpdate }: UnifiedChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // 保留 onThreadUpdate 参数以供将来使用
  void onThreadUpdate;

  // MCP configuration state
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // Sandbox state
  const [isSandboxReady, setIsSandboxReady] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Canvas hook
  const canvas = useCanvas({ threadId });

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
    canvas,
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

  // Chat hook with artifact detection
  const chat = useChat({
    threadId,
    mcpConfigId: selectedMcpId,
    onArtifactDetected: (content: string) => {
      // 首次检测到代码时，创建乐观版本用于展示代码生成过程
      if (!canvas.selectedVersion || canvas.selectedVersion === 0) {
        console.log("[UnifiedChat] 检测到代码生成，创建乐观版本");
        canvas.createOptimisticVersion();
      }

      // 确保在更新代码前禁止沙箱渲染
      canvas.setShouldSendToSandbox(false);

      // 使用合并逻辑，保留未修改的文件
      canvas.mergeAndSetGeneratedCode(content);
    },
    onStreamStart: () => {
      console.log("[UnifiedChat] 流式响应开始");
      canvas.setShouldSendToSandbox(false);
    },
    onStreamComplete: async () => {
      // 流式响应完成
      if (canvas.artifact && canvas.artifact.files.length > 0) {
        console.log("[UnifiedChat] 代码生成完成，保存到后端");

        // 调用保存接口
        try {
          const response = await fetch("/api/artifact/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              threadId,
              files: canvas.artifact.files.map((f) => ({
                path: f.path,
                content: f.content,
              })),
            }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log("[UnifiedChat] 保存成功:", result);

            // 刷新版本列表
            await canvas.refreshVersionList();
            console.log("[UnifiedChat] 版本列表刷新完成");

            // 允许发送到沙箱渲染
            canvas.setShouldSendToSandbox(true);
          } else {
            console.error("[UnifiedChat] 保存失败:", await response.text());
          }
        } catch (error) {
          console.error("[UnifiedChat] 保存出错:", error);
        }
      } else {
        console.log("[UnifiedChat] 代码生成完成但没有 artifact");
      }
    },
  });

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
  useEffect(() => {
    if (!isUserScrolling) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages, isUserScrolling]);

  // Detect user scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
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
  }, []);

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

  return (
    <div className="h-full bg-background">
      <SplitPane direction="horizontal">
        {/* Left: Chat Area */}
        <Pane defaultSize="40%" minSize="300px">
          <div className="flex h-full flex-col border-r border-border">
            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar"
            >
              {chat.messages.length === 0 && <EmptyState />}

              {chat.messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  messages={chat.messages}
                />
              ))}

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
              value={chat.input}
              onChange={chat.setInput}
              onSubmit={chat.sendMessage}
              isLoading={chat.isLoading}
              isCanvasMode={true}
              images={chat.images}
              onImagesChange={chat.setImages}
              mcpConfigs={mcpConfigs}
              selectedMcpId={selectedMcpId}
              isMcpLoading={isMcpLoading}
              onMcpSelect={setSelectedMcpId}
              onMcpRefresh={fetchMcpConfigs}
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

// Empty state component
function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-gray-500">
      <div className="text-center">
        <div className="mb-4 text-4xl">💬</div>
        <div className="mb-2 text-lg font-medium">开始对话</div>
        <div className="text-sm">你可以问我任何问题，或者让我帮你生成代码</div>
      </div>
    </div>
  );
}
