// components/canvas/preview-toolbar.tsx
"use client";

import {
  RefreshCw,
  Maximize2,
  Minimize2,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import type { DeviceType, ArtifactVersion } from "./types";

interface PreviewToolbarProps {
  selectedDevice: DeviceType;
  onDeviceChange: (device: DeviceType) => void;
  onToggleFullscreen: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  versions: ArtifactVersion[];
  selectedVersion: number | null;
  onSelectVersion: (versionNumber: number) => void;
  isLoadingVersions?: boolean;
  onLanguageChange: (language: "zh" | "en") => void;
  currentLanguage: "zh" | "en";
}

export function PreviewToolbar({
  selectedDevice,
  onDeviceChange,
  onToggleFullscreen,
  onRefresh,
  isRefreshing = false,
  versions,
  selectedVersion,
  onSelectVersion,
  isLoadingVersions = false,
  onLanguageChange,
  currentLanguage,
}: PreviewToolbarProps) {
  const devices: { type: DeviceType; icon: typeof Monitor; label: string }[] = [
    { type: "desktop", icon: Monitor, label: "桌面" },
    { type: "tablet", icon: Tablet, label: "平板" },
    { type: "mobile", icon: Smartphone, label: "手机" },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
      {/* 左侧：版本选择 */}
      <div className="flex items-center gap-2">
        {versions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">版本:</span>
            <select
              value={selectedVersion || ""}
              onChange={(e) => onSelectVersion(Number(e.target.value))}
              disabled={isLoadingVersions}
              className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.versionNumber}>
                  v{version.versionNumber} - {version.description || "无描述"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 中间：设备选择 */}
      <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-1">
        {devices.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => onDeviceChange(type)}
            className={`p-1.5 rounded transition-colors ${
              selectedDevice === type
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-600"
            }`}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* 右侧：语言切换、刷新和全屏 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            onLanguageChange(currentLanguage === "zh" ? "en" : "zh")
          }
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex items-center gap-1"
          title={currentLanguage === "zh" ? "切换到英文" : "切换到中文"}
        >
          <span className="text-xs font-medium">
            {currentLanguage === "zh" ? "EN" : "中"}
          </span>
        </button>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          title="刷新预览"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="全屏"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
