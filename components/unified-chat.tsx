// components/unified-chat.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";

// Hooks
import { useChat } from "@/hooks/use-chat";
import { useCanvas } from "@/hooks/use-canvas";

// Components
import { type MCPConfig } from "@/components/mcp";
import { MessageItem, InputBar } from "@/components/chat";
import { CanvasPanel } from "@/components/canvas";

interface UnifiedChatProps {
  threadId?: string;
  onThreadUpdate?: () => void;
}

export function UnifiedChat({ threadId, onThreadUpdate }: UnifiedChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 保留 onThreadUpdate 参数以供将来使用
  void onThreadUpdate;

  // MCP configuration state
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // Sandbox state
  const [isSandboxReady, setIsSandboxReady] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Canvas hook
  const canvas = useCanvas({ threadId });

  // Chat hook with artifact detection
  const chat = useChat({
    threadId,
    mcpConfigId: selectedMcpId,
    onArtifactDetected: (content: string) => {
      // 使用合并逻辑，保留未修改的文件
      canvas.mergeAndSetGeneratedCode(content);

      // 检查是否审查通过，如果通过则允许发送到沙箱
      const hasReviewApproval =
        content.includes("<reviewer_result>APPROVE") ||
        content.includes("APPROVE");
      if (hasReviewApproval) {
        console.log("[UnifiedChat] 审查通过，允许发送到沙箱");
        canvas.setShouldSendToSandbox(true);
      } else {
        console.log("[UnifiedChat] 代码生成中或未通过审查，暂不发送到沙箱");
        canvas.setShouldSendToSandbox(false);
      }
    },
    onSaved: async () => {
      // 后端保存成功后，刷新版本列表并切换到最新完整版本
      console.log("[UnifiedChat] 收到 saved 事件，刷新版本列表");
      await canvas.refreshVersionList();

      // 延迟一下，确保版本列表已更新，然后切换到最新版本获取完整代码
      setTimeout(async () => {
        if (canvas.versions.length > 0) {
          const latestVersion = canvas.versions[0];
          console.log(
            "[UnifiedChat] 切换到最新完整版本:",
            latestVersion.versionNumber
          );
          canvas.selectVersion(latestVersion.versionNumber);
        }
      }, 500);
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

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

  // Handle canvas expand
  const handleCanvasExpand = useCallback(() => {
    canvas.expand();
  }, [canvas]);

  // Handle canvas close
  const handleCanvasClose = useCallback(() => {
    canvas.collapse();
  }, [canvas]);

  return (
    <div className="flex h-full bg-white dark:bg-gray-900">
      {/* Main Chat Area */}
      <div
        className={`flex flex-col transition-all duration-300 ${
          canvas.isExpanded ? "w-[35%] border-r dark:border-gray-700" : "w-full"
        }`}
      >
        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {chat.messages.length === 0 && <EmptyState />}

          {chat.messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onCanvasExpand={handleCanvasExpand}
            />
          ))}

          {chat.isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
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
          isCanvasMode={canvas.isExpanded}
          mcpConfigs={mcpConfigs}
          selectedMcpId={selectedMcpId}
          isMcpLoading={isMcpLoading}
          onMcpSelect={setSelectedMcpId}
          onMcpRefresh={fetchMcpConfigs}
        />
      </div>

      {/* Canvas Panel (豆包风格：点击卡片展开) */}
      {canvas.isExpanded && (
        <div className="w-[65%] animate-slide-in-right">
          <CanvasPanel
            canvas={canvas}
            onClose={handleCanvasClose}
            iframeRef={iframeRef}
            isSandboxReady={isSandboxReady}
            sandboxError={sandboxError}
          />
        </div>
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
