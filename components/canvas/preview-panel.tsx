// components/canvas/preview-panel.tsx
"use client";

import { forwardRef } from "react";
import type { DeviceType } from "./types";

interface PreviewPanelProps {
  isVisible: boolean;
  selectedDevice: DeviceType;
  sandboxError: string | null;
  isSandboxReady: boolean;
}

function getDeviceSize(device: DeviceType) {
  switch (device) {
    case "mobile":
      return { width: "375px", height: "667px" };
    case "tablet":
      return { width: "768px", height: "1024px" };
    default:
      return { width: "100%", height: "100%" };
  }
}

export const PreviewPanel = forwardRef<HTMLIFrameElement, PreviewPanelProps>(
  function PreviewPanel(
    { isVisible, selectedDevice, sandboxError, isSandboxReady },
    ref
  ) {
    const deviceSize = getDeviceSize(selectedDevice);

    return (
      <div
        className={`absolute inset-0 flex items-center justify-center bg-gray-800 transition-opacity duration-200 p-4 ${
          isVisible ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
        }`}
      >
        <div
          className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300 relative"
          style={{
            width: deviceSize.width,
            height: deviceSize.height,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
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
            title="Code Sandbox"
          />
        </div>
      </div>
    );
  }
);
