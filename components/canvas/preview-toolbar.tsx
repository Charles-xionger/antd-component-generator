// components/canvas/preview-toolbar.tsx
"use client";

import {
  RefreshCw,
  Maximize2,
  Monitor,
  Tablet,
  Smartphone,
  Share2,
  Rocket,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeviceType, ArtifactVersion } from "./types";
import { workspacePreviewLabel } from "@/lib/workspace/presentation";

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
  onShare?: () => void;
  isSharing?: boolean;
  onPublish?: () => void;
  isPublishing?: boolean;
  fullstackPreview?: { status: string; previewUrl?: string | null; errorMessage?: string | null } | null;
  onOpenFullstackPreview?: () => void;
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
  onShare,
  isSharing = false,
  onPublish,
  isPublishing = false,
  fullstackPreview,
  onOpenFullstackPreview,
}: PreviewToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-background border-b">
      {/* 左侧：版本选择 */}
      <div className="flex items-center gap-2">
        {fullstackPreview && (
          fullstackPreview.status === "SUCCEEDED" && fullstackPreview.previewUrl ? (
            <Button variant="outline" size="sm" onClick={onOpenFullstackPreview}>
              <ExternalLink className="h-4 w-4 mr-1" />{workspacePreviewLabel(fullstackPreview.status)}
            </Button>
          ) : fullstackPreview.status === "FAILED" ? (
            <details className="max-w-64 text-xs text-destructive">
              <summary className="cursor-pointer">{workspacePreviewLabel(fullstackPreview.status)}</summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-foreground">{(fullstackPreview.errorMessage || "构建或启动失败，错误详情暂不可用").slice(0, 4000)}</pre>
            </details>
          ) : (
            <span className="text-xs text-muted-foreground" role="status">{workspacePreviewLabel(fullstackPreview.status)}</span>
          )
        )}
        {versions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">版本:</span>
            <Select
              value={selectedVersion?.toString() || ""}
              onValueChange={(value) => onSelectVersion(Number(value))}
              disabled={isLoadingVersions}
            >
              <SelectTrigger className="h-8 w-45 text-xs">
                <SelectValue placeholder="选择版本" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem
                    key={version.id}
                    value={version.versionNumber.toString()}
                  >
                    v{version.versionNumber} - {version.description || "无描述"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 中间：设备选择 */}
      <ToggleGroup
        type="single"
        value={selectedDevice}
        onValueChange={(value) => value && onDeviceChange(value as DeviceType)}
      >
        <ToggleGroupItem value="desktop" aria-label="桌面视图" size="sm">
          <Monitor className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="tablet" aria-label="平板视图" size="sm">
          <Tablet className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="mobile" aria-label="手机视图" size="sm">
          <Smartphone className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      {/* 右侧：分享、语言切换、刷新和全屏 */}
      <div className="flex items-center gap-2">
        {onPublish && (
          <Button
            size="sm"
            onClick={onPublish}
            disabled={isPublishing}
            title="发布当前版本"
          >
            <Rocket className="h-4 w-4 mr-1" />
            {isPublishing ? "发布中" : "发布"}
          </Button>
        )}
        {onShare && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShare}
            disabled={isSharing}
            title="分享预览"
          >
            <Share2 className="h-4 w-4 mr-1" />
            {isSharing ? "生成中" : "分享"}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onLanguageChange(currentLanguage === "zh" ? "en" : "zh")
          }
          title={currentLanguage === "zh" ? "切换到英文" : "切换到中文"}
        >
          <span className="text-xs font-medium">
            {currentLanguage === "zh" ? "EN" : "中"}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="刷新预览"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleFullscreen}
          title="全屏"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
