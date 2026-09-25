// components/canvas/canvas-panel.tsx
"use client";

import { forwardRef, useEffect, useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CodePanel } from "./code-panel";
import { PreviewPanel } from "./preview-panel";
import { PreviewToolbar } from "./preview-toolbar";
import type { UseCanvasReturn } from "@/hooks/use-canvas";

interface CanvasPanelProps {
  projectId?: string;
  canvas: UseCanvasReturn;
  onClose?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  isSandboxReady?: boolean;
  sandboxError?: string | null;
  onFullscreenToggle?: () => void;
  onSandboxReset?: () => void;
  isFullscreen?: boolean;
}

export const CanvasPanel = forwardRef<HTMLDivElement, CanvasPanelProps>(
  function CanvasPanel(
    {
      canvas,
      projectId,
      iframeRef,
      isSandboxReady = false,
      sandboxError = null,
      onFullscreenToggle,
      onSandboxReset,
      isFullscreen = false,
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

    // 刷新和语言状态
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [currentLanguage, setCurrentLanguage] = useState<"zh" | "en">("zh");

    // 分享对话框状态
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const [isCreatingShare, setIsCreatingShare] = useState(false);
    const [copiedShareUrl, setCopiedShareUrl] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

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

    // 处理语言切换
    const handleLanguageChange = useCallback(
      (language: "zh" | "en") => {
        if (iframeRef?.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            {
              protocolVersion: 1,
              type: "CHANGE_LANGUAGE",
              lng: language,
            },
            "*"
          );
          setCurrentLanguage(language);
          console.log(`语言已切换到: ${language === "zh" ? "中文" : "英文"}`);
        }
      },
      [iframeRef]
    );

    // 处理分享
    const handleShare = useCallback(async () => {
      if (!selectedVersion || !versions.length) {
        toast.error("请先生成代码");
        return;
      }

      // 获取当前版本的 ID
      const currentVersion = versions.find(
        (v) => v.versionNumber === selectedVersion
      );
      if (!currentVersion) {
        toast.error("版本不存在");
        return;
      }

      setIsCreatingShare(true);
      try {
        const response = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifactVersionId: currentVersion.id,
          }),
        });

        if (!response.ok) {
          throw new Error("创建分享失败");
        }

        const data = await response.json();
        setShareUrl(data.shareUrl);
        setShareDialogOpen(true);
        toast.success("分享链接已生成");
      } catch (error) {
        console.error("Failed to create share:", error);
        toast.error("创建分享失败，请稍后重试");
      } finally {
        setIsCreatingShare(false);
      }
    }, [selectedVersion, versions]);

    // 复制分享链接
    const copyShareUrl = useCallback(() => {
      navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      toast.success("链接已复制到剪贴板");
      setTimeout(() => setCopiedShareUrl(false), 2000);
    }, [shareUrl]);

    const handlePublish = useCallback(async () => {
      if (!projectId || !selectedVersion) {
        toast.error("请先生成代码");
        return;
      }
      const version = versions.find(
        (item) => item.versionNumber === selectedVersion,
      );
      if (!version) return;
      if (!window.confirm("发布后任何知道地址的人都可以访问，确认发布当前版本？")) {
        return;
      }

      setIsPublishing(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/deployments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifactVersionId: version.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "发布失败");
        toast.success("发布成功");
        window.open(data.publishedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发布失败");
      } finally {
        setIsPublishing(false);
      }
    }, [projectId, selectedVersion, versions]);

    // 沙箱就绪且应该发送文件时才发送（审查通过后）
    useEffect(() => {
      if (
        isSandboxReady &&
        activeTab === "preview" &&
        artifact &&
        iframeRef &&
        shouldSendToSandbox &&
        !isRefreshing
      ) {
        // 添加小延迟确保沙箱完全初始化
        const timer = setTimeout(() => {
          console.log("审查通过，发送文件到沙箱");
          sendFilesToSandbox(iframeRef);
        }, 200);
        return () => clearTimeout(timer);
      }
    }, [
      isSandboxReady,
      activeTab,
      artifact,
      iframeRef,
      sendFilesToSandbox,
      shouldSendToSandbox,
      isRefreshing,
    ]);

    // 渲染面板内容
    return (
      <div ref={ref} className="flex flex-col bg-background h-full">
        {/* Canvas Header */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "preview" | "code")}
            className="flex-1"
          >
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
              </TabsList>

              {/* Version Number */}
              {selectedVersion && (
                <div className="text-sm text-muted-foreground">
                  v{selectedVersion}
                </div>
              )}
            </div>
          </Tabs>
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
            onLanguageChange={handleLanguageChange}
            currentLanguage={currentLanguage}
            onShare={handleShare}
            isSharing={isCreatingShare}
            onPublish={projectId ? handlePublish : undefined}
            isPublishing={isPublishing}
          />
        )}

        {/* Canvas Content - 两个面板都保持挂载，通过 CSS 控制显示 */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {/* Preview Panel - 始终挂载以保持 iframe 在线 */}
          <PreviewPanel
            ref={isFullscreen ? null : iframeRef}
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

        {/* 分享对话框 */}
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>分享预览链接</DialogTitle>
              <DialogDescription>
                复制此链接分享给其他人，他们无需登录即可查看预览效果
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 mt-4">
              <Input value={shareUrl} readOnly className="flex-1" />
              <Button size="sm" onClick={copyShareUrl} disabled={!shareUrl}>
                {copiedShareUrl ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    复制
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);
