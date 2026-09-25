// app/preview/[shareCode]/page.tsx
"use client";

import { useEffect, useState, use, useRef } from "react";
import { PreviewPanel } from "@/components/canvas/preview-panel";
import { SANDBOX_ORIGIN } from "@/lib/sandbox-config";

interface FileData {
  path: string;
  content: string;
}

interface ShareData {
  version: {
    id: string;
    versionNumber: number;
    description: string | null;
    createdAt: string;
    files: FileData[];
  };
}

export default function SharePreviewPage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const resolvedParams = use(params);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSandboxReady, setIsSandboxReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    async function fetchShare() {
      try {
        const response = await fetch(`/api/share/${resolvedParams.shareCode}`);
        if (!response.ok) {
          throw new Error("分享不存在或已过期");
        }
        const data = await response.json();
        console.log("[Share] 加载分享数据:", data);
        setShareData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      }
    }

    fetchShare();
  }, [resolvedParams.shareCode]);

  // 当数据加载完成且沙箱就绪后，发送代码到沙箱
  useEffect(() => {
    if (!shareData || !isSandboxReady || !iframeRef.current?.contentWindow) {
      console.log("[Share] 等待条件:", {
        hasData: !!shareData,
        sandboxReady: isSandboxReady,
        hasIframe: !!iframeRef.current?.contentWindow,
      });
      return;
    }

    console.log(
      "[Share] 发送代码到沙箱, 文件数:",
      shareData.version.files.length
    );

    // 将文件转换为 sandbox 需要的格式（使用文件名作为 key）
    const files: Record<string, string> = {};
    shareData.version.files.forEach((file) => {
      const fileName = file.path.split("/").pop() || file.path;
      files[fileName] = file.content;
    });

    // 查找入口文件（优先 App.tsx）
    const entryFile = (() => {
      const appFile = shareData.version.files.find((f) =>
        f.path.includes("App.tsx")
      );
      if (appFile) return appFile.path.split("/").pop() || "App.tsx";

      const componentFile = shareData.version.files.find(
        (f) => f.path.endsWith(".tsx") && !f.path.toLowerCase().includes("use")
      );
      if (componentFile)
        return componentFile.path.split("/").pop() || "App.tsx";

      const tsxFile = shareData.version.files.find((f) =>
        f.path.endsWith(".tsx")
      );
      if (tsxFile) return tsxFile.path.split("/").pop() || "App.tsx";

      return "App.tsx";
    })();

    console.log(
      "[Share] 入口文件:",
      entryFile,
      "文件列表:",
      Object.keys(files)
    );

    // 延迟发送确保沙箱完全初始化
    setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "artifacts",
          payload: { files, entryFile },
        },
        SANDBOX_ORIGIN
      );
      console.log("[Share] 代码已发送到沙箱");
    }, 500);
  }, [shareData, isSandboxReady]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-lg font-medium text-foreground mb-2">
            加载失败
          </div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="text-sm text-muted-foreground">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="h-14 border-b bg-secondary/50 flex items-center px-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-foreground">分享预览</div>
          <div className="text-xs text-muted-foreground">
            v{shareData.version.versionNumber}
          </div>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-hidden">
        <PreviewPanel
          ref={iframeRef}
          isVisible={true}
          isSandboxReady={isSandboxReady}
          selectedDevice="desktop"
          onSandboxReady={() => {
            console.log("[Share] 沙箱已就绪");
            setIsSandboxReady(true);
          }}
        />
      </div>
    </div>
  );
}
