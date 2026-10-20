"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Rocket,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPublishChecks,
  getPublishProgress,
  resolvePublishOutcome,
  type DeploymentSummary,
} from "@/lib/publishing/publish-flow";

type PublishPhase = "preflight" | "publishing" | "success" | "error";

interface PublishFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  artifactVersionId: string;
  versionNumber: number;
  fileCount: number;
  fullstackPreview: {
    status: string;
    previewUrl?: string | null;
    errorMessage?: string | null;
  } | null;
}

const progressSteps = ["准备版本", "构建与验证", "切换公开地址"];

export function PublishFlowDialog({
  open,
  onOpenChange,
  projectId,
  artifactVersionId,
  versionNumber,
  fileCount,
  fullstackPreview,
}: PublishFlowDialogProps) {
  const [phase, setPhase] = useState<PublishPhase>("preflight");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState("");

  const checks = useMemo(
    () =>
      getPublishChecks({
        versionNumber,
        fileCount,
        fullstackPreview,
      }),
    [fileCount, fullstackPreview, versionNumber],
  );
  const isBlocked = checks.some((check) => check.status === "blocked");

  const reset = useCallback(() => {
    setPhase("preflight");
    setDeploymentId(null);
    setPublishedUrl("");
    setErrorMessage("");
    setCopied(false);
    setQrCode("");
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset, artifactVersionId]);

  useEffect(() => {
    if (phase !== "success" || !publishedUrl) return;
    let active = true;
    void QRCode.toDataURL(publishedUrl, {
      width: 176,
      margin: 1,
      color: { dark: "#111827", light: "#ffffff" },
    }).then((value) => {
      if (active) setQrCode(value);
    });
    return () => {
      active = false;
    };
  }, [phase, publishedUrl]);

  useEffect(() => {
    if (phase !== "publishing" || !deploymentId) return;
    let active = true;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/projects/${projectId}/deployments`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法获取发布状态");
        const outcome = resolvePublishOutcome(
          deploymentId,
          (data.deployments || []) as DeploymentSummary[],
        );
        if (!active) return;
        if (outcome.status === "success") {
          setPublishedUrl(data.publishedUrl || publishedUrl);
          setPhase("success");
        } else if (outcome.status === "failed") {
          setErrorMessage(outcome.errorMessage || "发布检查未通过，请重试");
          setPhase("error");
        } else if (attempts >= 60) {
          setErrorMessage("发布仍在后台进行，可稍后前往发布中心查看状态");
          setPhase("error");
        }
      } catch (error) {
        if (active && attempts >= 3) {
          setErrorMessage(error instanceof Error ? error.message : "无法获取发布状态");
          setPhase("error");
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [deploymentId, phase, projectId, publishedUrl]);

  const startPublish = async () => {
    setPhase("publishing");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactVersionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发布失败");
      setPublishedUrl(data.publishedUrl || "");
      if (response.status === 202) {
        setDeploymentId(data.deployment.id);
      } else {
        setPhase("success");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "发布失败");
      setPhase("error");
    }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(publishedUrl);
    setCopied(true);
    toast.success("公开地址已复制");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const progress = getPublishProgress(
    phase === "success" ? "ACTIVE" : phase === "error" ? "FAILED" : "BUILDING",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto p-0 sm:max-w-[720px]">
        {phase === "preflight" && (
          <>
            <DialogHeader className="border-b px-7 py-6 pr-14">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Rocket className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl">发布 v{versionNumber}</DialogTitle>
              <DialogDescription>
                检查当前版本并将它发布到稳定的公开地址。线上旧版本会持续可用，直到新版本检查通过。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-7 py-6">
              <div>
                <p className="mb-3 text-sm font-medium">发布前检查</p>
                <div className="overflow-hidden rounded-xl border">
                  {checks.map((check, index) => (
                    <div
                      key={check.label}
                      className={`flex items-start gap-3 px-4 py-3.5 ${index ? "border-t" : ""}`}
                    >
                      {check.status === "blocked" ? (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{check.label}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-3.5">
                <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">稳定地址，不影响正在使用的人</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    新版本构建失败时不会替换当前线上版本。发布后仍可在发布中心回滚或下线。
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t bg-muted/20 px-7 py-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
              <Button onClick={startPublish} disabled={isBlocked}>
                <Rocket className="mr-2 h-4 w-4" />确认发布
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "publishing" && (
          <div className="px-8 py-12">
            <DialogHeader className="items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LoaderCircle className="h-7 w-7 animate-spin" />
              </div>
              <DialogTitle className="text-xl">{progress.title}</DialogTitle>
              <DialogDescription>
                正在安全地发布 v{versionNumber}，你可以关闭窗口，任务会继续在后台运行。
              </DialogDescription>
            </DialogHeader>
            <div className="mx-auto mt-9 max-w-lg">
              <div className="flex items-start">
                {progressSteps.map((step, index) => (
                  <div key={step} className="relative flex flex-1 flex-col items-center text-center">
                    {index > 0 && (
                      <div className={`absolute right-1/2 top-3 h-px w-full ${index <= progress.activeStep ? "bg-primary" : "bg-border"}`} />
                    )}
                    <div className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-xs ${index < progress.activeStep ? "border-primary bg-primary text-primary-foreground" : index === progress.activeStep ? "border-primary bg-background text-primary" : "border-border bg-background text-muted-foreground"}`}>
                      {index < progress.activeStep ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </div>
                    <span className="mt-2 text-xs text-muted-foreground">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === "success" && (
          <>
            <div className="px-8 pb-6 pt-9">
              <DialogHeader className="items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Check className="h-7 w-7" />
                </div>
                <DialogTitle className="text-2xl">应用已发布</DialogTitle>
                <DialogDescription>
                  v{versionNumber} 已上线，现在可以把这个地址交给其他人使用。
                </DialogDescription>
              </DialogHeader>

              <div className="mt-7 grid gap-5 rounded-2xl border bg-muted/20 p-5 sm:grid-cols-[1fr_176px]">
                <div className="flex min-w-0 flex-col justify-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">公开地址</p>
                  <p className="mt-2 truncate text-sm font-medium" title={publishedUrl}>{publishedUrl}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={copyUrl}>
                      {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copied ? "已复制" : "复制地址"}
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={publishedUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />打开应用
                      </a>
                    </Button>
                  </div>
                </div>
                <div className="flex h-44 w-44 items-center justify-center rounded-xl border bg-white p-2">
                  {qrCode ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrCode} alt="公开地址二维码" className="h-full w-full" />
                  ) : (
                    <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="border-t bg-muted/20 px-7 py-4 sm:justify-between">
              <Button variant="ghost" asChild>
                <Link href="/deployments">查看发布中心</Link>
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>继续修改</Button>
            </DialogFooter>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="px-8 py-10">
              <DialogHeader className="items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <DialogTitle className="text-xl">发布未完成</DialogTitle>
                <DialogDescription>
                  当前线上版本没有受到影响。修复问题后可以重新尝试。
                </DialogDescription>
              </DialogHeader>
              <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            </div>
            <DialogFooter className="border-t bg-muted/20 px-7 py-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>关闭</Button>
              <Button onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />返回检查
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
