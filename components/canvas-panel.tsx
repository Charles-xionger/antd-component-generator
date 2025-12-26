// components/canvas-panel.tsx
"use client";

import { forwardRef } from "react";
import { X } from "lucide-react";
import { CodePanel } from "./canvas/code-panel";
import { PreviewPanel } from "./canvas/preview-panel";
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
      copiedFile,
      copyToClipboard,
    } = canvas;

    return (
      <div
        ref={ref}
        className="flex h-full flex-col bg-gray-50 dark:bg-gray-900"
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
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-gray-700"
            title="关闭 Canvas"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Canvas Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "preview" ? (
            <PreviewPanel
              ref={iframeRef}
              isVisible={true}
              isSandboxReady={isSandboxReady}
              sandboxError={sandboxError}
              selectedDevice={selectedDevice}
            />
          ) : (
            <CodePanel
              isVisible={true}
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
          )}
        </div>
      </div>
    );
  }
);
