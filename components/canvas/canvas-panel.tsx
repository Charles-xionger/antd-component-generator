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
}

export const CanvasPanel = forwardRef<HTMLDivElement, CanvasPanelProps>(
  function CanvasPanel(
    { canvas, onClose, iframeRef, isSandboxReady = false, sandboxError = null },
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
    } = canvas;

    // 全屏状态
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 切换全屏
    const toggleFullscreen = useCallback(() => {
      setIsFullscreen((prev) => !prev);
    }, []);

    // 刷新预览
    const handleRefresh = useCallback(() => {
      if (!iframeRef?.current) return;

      setIsRefreshing(true);

      // 重新加载 iframe
      const iframe = iframeRef.current;
      iframe.src = iframe.src;

      // 等待重新加载后发送文件
      setTimeout(() => {
        if (artifact && iframeRef) {
          sendFilesToSandbox(iframeRef);
        }
        setIsRefreshing(false);
      }, 1000);
    }, [artifact, iframeRef, sendFilesToSandbox]);

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
          isFullscreen ? "fixed inset-0 z-[9999] bg-gray-900" : "h-full"
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

          {/* Close Button */}
          <button
            onClick={isFullscreen ? () => setIsFullscreen(false) : onClose}
            className="rounded p-1 transition-colors hover:bg-gray-700"
            title={isFullscreen ? "退出全屏" : "关闭 Canvas"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview Toolbar - 只在 Preview 模式显示 */}
        {activeTab === "preview" && (
          <PreviewToolbar
            selectedDevice={selectedDevice}
            onDeviceChange={setSelectedDevice}
            isFullscreen={isFullscreen}
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
