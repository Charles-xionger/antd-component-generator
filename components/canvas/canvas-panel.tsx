// components/canvas/canvas-panel.tsx
"use client";

import { forwardRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CodePanel } from "./code-panel";
import { PreviewPanel } from "./preview-panel";
import { PreviewToolbar } from "./preview-toolbar";
import type { UseCanvasReturn } from "@/hooks/use-canvas";

interface CanvasPanelProps {
  canvas: UseCanvasReturn;
  onClose: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  isSandboxReady?: boolean;
  sandboxError?: string | null;
  onFullscreenToggle?: () => void;
  onSandboxReset?: () => void;
}

export const CanvasPanel = forwardRef<HTMLDivElement, CanvasPanelProps>(
  function CanvasPanel(
    {
      canvas,
      onClose,
      iframeRef,
      isSandboxReady = false,
      sandboxError = null,
      onFullscreenToggle,
      onSandboxReset,
    },
    ref
  ) {
    const {
      artifact,
      selectedFile,
      selectFile,
      versions,
      selectedVersion,
      isLoadingVersions,
      selectVersion,
      activeTab,
      setActiveTab,
      selectedDevice,
      setSelectedDevice,
      copiedFile,
      copyToClipboard,
      sendFilesToSandbox,
      shouldSendToSandbox,
      setShouldSendToSandbox,
    } = canvas;

    // 全屏状态
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 切换全屏 - 调用父组件回调
    const toggleFullscreen = useCallback(() => {
      console.log("[全屏] 点击全屏按钮");
      // 进入全屏时，自动切换到 preview 并允许渲染
      if (artifact && artifact.files.length > 0) {
        setActiveTab("preview");
        setShouldSendToSandbox(true);
      }
      onFullscreenToggle?.();
    }, [artifact, setActiveTab, setShouldSendToSandbox, onFullscreenToggle]);

    // 刷新预览
    const handleRefresh = useCallback(() => {
      if (!iframeRef?.current || !artifact) {
        console.log("[刷新] 无法刷新：iframe 或 artifact 不存在");
        return;
      }

      console.log("[刷新] 开始刷新沙箱...");

      // 通知父组件重置沙箱状态
      onSandboxReset?.();

      setIsRefreshing(true);

      // 重新加载 iframe
      const iframe = iframeRef.current;
      try {
        // 使用 contentWindow.location.reload() 刷新
        iframe.contentWindow?.location.reload();
        console.log("[刷新] iframe 重新加载");
      } catch {
        // 如果跨域导致失败，回退到修改 src 的方式
        console.log("[刷新] 使用备用刷新方式");
        const currentSrc = iframe.src;
        iframe.src = "";
        setTimeout(() => {
          iframe.src = currentSrc;
        }, 50);
      }

      // 5秒后取消loading状态
      setTimeout(() => {
        setIsRefreshing(false);
      }, 5000);
    }, [artifact, iframeRef, onSandboxReset]);

    // 沙箱就绪且应该发送文件时才发送（审查通过后）
    useEffect(() => {
      if (
        isSandboxReady &&
        activeTab === "preview" &&
        artifact &&
        iframeRef &&
        shouldSendToSandbox
      ) {
        // 添加小延迟确保沙箱完全初始化
        const timer = setTimeout(() => {
          console.log("审查通过，发送文件到沙箱");
          sendFilesToSandbox(iframeRef);
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [
      isSandboxReady,
      activeTab,
      artifact,
      iframeRef,
      sendFilesToSandbox,
      shouldSendToSandbox,
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

    // 渲染面板内容
    const panelContent = (
      <div
        ref={isFullscreen ? undefined : ref}
        className={`flex flex-col bg-gray-50 dark:bg-gray-900 transition-all duration-300 ${
          isFullscreen ? "fixed inset-0 z-9999 bg-gray-900" : "h-full"
        }`}
      >
        {/* Canvas Header */}
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900 px-4 py-2 text-white">
          <div className="flex items-center gap-4">
            {/* Tab Switcher */}
            <button
              onClick={() => setActiveTab("preview")}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                activeTab === "preview"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                activeTab === "code"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Code
            </button>
          </div>

          {/* Artifact Title */}
          {artifact && (
            <div className="text-sm text-gray-400">
              {artifact.title}
              {selectedVersion && (
                <span className="ml-2 text-xs">v{selectedVersion}</span>
              )}
            </div>
          )}

          {/* 全屏模式下显示退出按钮 */}
          {isFullscreen && (
            <button
              onClick={() => setIsFullscreen(false)}
              className="rounded p-1 transition-colors hover:bg-gray-700"
              title="退出全屏"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Preview Toolbar - 只在 Preview 模式显示 */}
        {activeTab === "preview" && (
          <PreviewToolbar
            selectedDevice={selectedDevice}
            onDeviceChange={setSelectedDevice}
            onToggleFullscreen={toggleFullscreen}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            versions={versions}
            selectedVersion={selectedVersion}
            onSelectVersion={selectVersion}
            isLoadingVersions={isLoadingVersions}
          />
        )}

        {/* Canvas Content - 两个面板都保持挂载，通过 CSS 控制显示 */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {/* Preview Panel - 始终挂载以保持 iframe 在线 */}
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
    );

    // 全屏时使用 Portal 渲染到 body，确保脱离父容器限制
    if (isFullscreen && typeof document !== "undefined") {
      return (
        <>
          {/* 保留原位置的占位符，避免布局跳动 */}
          <div ref={ref} className="h-full bg-gray-900" />
          {createPortal(panelContent, document.body)}
        </>
      );
    }

    return panelContent;
  }
);
