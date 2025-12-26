// components/canvas/index.tsx
"use client";

import { useCanvasChat } from "./use-canvas-chat";
import { MessageList } from "./message-list";
import { PreviewPanel } from "./preview-panel";
import { CodePanel } from "./code-panel";
import { MCPConfigPanel } from "@/components/mcp-config-panel";

interface CanvasChatProps {
  threadId?: string;
  onThreadUpdate?: () => void;
}

export function CanvasChat({
  threadId: initialThreadId,
  onThreadUpdate,
}: CanvasChatProps) {
  const {
    // State
    messages,
    input,
    setInput,
    isLoading,
    threadId,
    copiedFile,

    // Sandbox
    iframeRef,
    isSandboxReady,
    sandboxError,
    isRendering,

    // Versions
    versions,
    selectedVersion,
    isLoadingVersions,

    // Artifact
    artifact,
    selectedFile,
    selectFile,

    // Panel state
    activeTab,
    isFullscreen,
    selectedDevice,
    setSelectedDevice,

    // MCP configuration
    mcpConfigs,
    selectedMcpId,
    isMcpLoading,
    onSelectMcp,
    onRefreshMcp,

    // Actions
    sendMessage,
    selectVersion,
    copyToClipboard,
    refreshPreview,
    toggleFullscreen,
    handleTabChange,
  } = useCanvasChat({ initialThreadId, onThreadUpdate });

  return (
    <div className="flex h-full">
      {/* Chat Panel */}
      <div className="w-1/3 flex flex-col border-r min-h-0">
        {/* MCP 配置面板 */}
        <MCPConfigPanel
          configs={mcpConfigs}
          selectedId={selectedMcpId}
          isLoading={isMcpLoading}
          onSelect={onSelectMcp}
          onRefresh={onRefreshMcp}
        />

        <MessageList messages={messages} isLoading={isLoading} />

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading && input.trim()) {
                  e.preventDefault();
                  sendMessage();
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
                  sendMessage();
                }
              }}
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "发送中..." : "发送"}
            </button>
          </div>
          {threadId && (
            <div className="text-xs text-gray-600 mt-2">
              会话 ID: {threadId}
            </div>
          )}
        </div>
      </div>

      {/* Canvas Panel - Preview & Code */}
      <div
        className={`${
          isFullscreen ? "fixed inset-0 z-50 bg-gray-900" : "flex-1"
        } flex flex-col min-h-0`}
      >
        {/* Canvas Header */}
        <div className="bg-gray-900 text-white flex items-center justify-between px-4 py-2 border-b border-gray-700">
          {/* Left: Preview/Code Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleTabChange("preview")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                activeTab === "preview"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {isRendering && activeTab === "preview" && (
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              )}
              Preview
            </button>
            <button
              onClick={() => handleTabChange("code")}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                activeTab === "code"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              Code
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {activeTab === "preview" && (
              <>
                {/* 全屏按钮 */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title={isFullscreen ? "退出全屏" : "全屏"}
                >
                  {isFullscreen ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                      />
                    </svg>
                  )}
                </button>

                {/* 设备选择器 */}
                <div className="flex items-center gap-1 bg-gray-800 rounded-md p-0.5">
                  <button
                    onClick={() => setSelectedDevice("desktop")}
                    className={`p-1.5 rounded transition-colors ${
                      selectedDevice === "desktop"
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                    title="桌面"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSelectedDevice("tablet")}
                    className={`p-1.5 rounded transition-colors ${
                      selectedDevice === "tablet"
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                    title="平板"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSelectedDevice("mobile")}
                    className={`p-1.5 rounded transition-colors ${
                      selectedDevice === "mobile"
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                    title="手机"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>

                {/* 刷新按钮 */}
                <button
                  onClick={refreshPreview}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="刷新预览"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </>
            )}

            {/* 沙箱状态指示器 */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isSandboxReady ? "bg-green-400" : "bg-yellow-400"
                }`}
              />
              {isSandboxReady ? "就绪" : "加载中"}
            </div>
          </div>
        </div>

        {/* Canvas Content */}
        <div className="flex-1 flex overflow-hidden bg-gray-800">
          {/* Preview Panel */}
          <PreviewPanel
            ref={iframeRef}
            isVisible={activeTab === "preview"}
            isSandboxReady={isSandboxReady}
            sandboxError={sandboxError}
            selectedDevice={selectedDevice}
          />

          {/* Code Panel */}
          <CodePanel
            isVisible={activeTab === "code"}
            artifact={artifact}
            selectedFile={selectedFile}
            versions={versions}
            selectedVersion={selectedVersion}
            isLoadingVersions={isLoadingVersions}
            copiedFile={copiedFile}
            onSelectFile={selectFile}
            onSelectVersion={selectVersion}
            onCopyToClipboard={copyToClipboard}
          />
        </div>
      </div>
    </div>
  );
}

// Re-export types
export type {
  Message,
  ArtifactVersion,
  ParsedFile,
  Artifact,
  DeviceType,
  TabType,
} from "./types";
