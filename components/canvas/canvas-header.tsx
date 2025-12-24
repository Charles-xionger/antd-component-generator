// components/canvas/canvas-header.tsx
"use client";

import type { DeviceType, TabType } from "./types";

interface CanvasHeaderProps {
  activeTab: TabType;
  deviceType: DeviceType;
  isFullscreen: boolean;
  onTabChange: (tab: TabType) => void;
  onDeviceChange: (device: DeviceType) => void;
  onToggleFullscreen: () => void;
  onRefreshPreview: () => void;
}

export function CanvasHeader({
  activeTab,
  deviceType,
  isFullscreen,
  onTabChange,
  onDeviceChange,
  onToggleFullscreen,
  onRefreshPreview,
}: CanvasHeaderProps) {
  return (
    <div className="flex items-center justify-between bg-gray-800 px-4 py-2 border-b border-gray-700">
      {/* Left: Tabs */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onTabChange("preview")}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            activeTab === "preview"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => onTabChange("code")}
          className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            activeTab === "code"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
          }`}
        >
          Code
        </button>
      </div>

      {/* Right: Device Selector and Actions */}
      <div className="flex items-center gap-2">
        {/* Device Selector */}
        <div className="flex items-center gap-1 bg-gray-700/50 rounded p-1">
          <button
            onClick={() => onDeviceChange("mobile")}
            className={`p-1.5 rounded transition-colors ${
              deviceType === "mobile"
                ? "bg-gray-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            title="Mobile"
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
          <button
            onClick={() => onDeviceChange("tablet")}
            className={`p-1.5 rounded transition-colors ${
              deviceType === "tablet"
                ? "bg-gray-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            title="Tablet"
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
            onClick={() => onDeviceChange("desktop")}
            className={`p-1.5 rounded transition-colors ${
              deviceType === "desktop"
                ? "bg-gray-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
            title="Desktop"
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
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefreshPreview}
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          title="Refresh Preview"
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

        {/* Fullscreen Button */}
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
      </div>
    </div>
  );
}
