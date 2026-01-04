// components/canvas/fullscreen-preview.tsx
"use client";

import { forwardRef } from "react";
import { X } from "lucide-react";

interface FullscreenPreviewProps {
  isSandboxReady: boolean;
  sandboxError: string | null;
  onClose: () => void;
}

export const FullscreenPreview = forwardRef<
  HTMLIFrameElement,
  FullscreenPreviewProps
>(function FullscreenPreview({ isSandboxReady, sandboxError, onClose }, ref) {
  return (
    <div className="fixed inset-0 z-9999 bg-background flex flex-col">
      {/* 退出按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10000 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white transition-colors"
        title="退出全屏 (ESC)"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Preview 容器 */}
      <div className="absolute inset-0 bg-muted">
        <div className="w-full h-full bg-white relative">
          {sandboxError && (
            <div className="absolute top-0 left-0 right-0 bg-red-100 border-b border-red-400 text-red-700 px-3 py-2 text-xs z-10">
              <div className="font-semibold">渲染错误:</div>
              <div>{sandboxError}</div>
            </div>
          )}
          {!isSandboxReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 z-10">
              <div className="text-center">
                {/* 加载动画 */}
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
                  <div
                    className="absolute inset-2 border-4 border-transparent border-t-blue-400 rounded-full animate-spin"
                    style={{
                      animationDirection: "reverse",
                      animationDuration: "0.8s",
                    }}
                  ></div>
                </div>
                {/* 文字提示 */}
                <div className="text-gray-700 font-medium text-base mb-2">
                  沙箱环境准备中
                </div>
                <div className="text-gray-500 text-sm">
                  正在初始化 React 渲染环境...
                </div>
                {/* 进度点 */}
                <div className="flex items-center justify-center gap-1 mt-4">
                  <div
                    className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
                    style={{ animationDelay: "0ms" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          <iframe
            ref={ref}
            src="http://localhost:5174/sandbox.html"
            className="w-full h-full border-0"
            title="Code Sandbox Fullscreen"
          />
        </div>
      </div>
    </div>
  );
});
