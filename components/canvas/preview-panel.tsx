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
        className={`absolute inset-0 flex items-center justify-center p-4 bg-gray-800 transition-opacity duration-200 ${
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
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
              <div className="text-center text-gray-500">
                <div className="text-sm">沙箱加载中...</div>
                <div className="text-xs mt-1">等待渲染环境就绪</div>
              </div>
            </div>
          )}
          <iframe
            ref={ref}
            src="http://localhost:4000"
            className="w-full h-full border-0"
            title="Code Sandbox"
          />
        </div>
      </div>
    );
  }
);
