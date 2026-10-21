"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Globe2, LoaderCircle, Rocket, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPublishChecks } from "@/lib/publishing/publish-flow";
import { deploymentStatusPath } from "@/lib/publishing/realtime-ui";

type PublishPhase = "preflight" | "submitting" | "error";

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

export function PublishFlowDialog({
  open,
  onOpenChange,
  projectId,
  artifactVersionId,
  versionNumber,
  fileCount,
  fullstackPreview,
}: PublishFlowDialogProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<PublishPhase>("preflight");
  const [errorMessage, setErrorMessage] = useState("");
  const checks = useMemo(() => getPublishChecks({ versionNumber, fileCount, fullstackPreview }), [fileCount, fullstackPreview, versionNumber]);
  const isBlocked = checks.some((check) => check.status === "blocked");

  const setOpen = (next: boolean) => {
    if (next) {
      setPhase("preflight");
      setErrorMessage("");
    }
    onOpenChange(next);
  };

  const startPublish = async () => {
    setPhase("submitting");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactVersionId }),
      });
      const data = await response.json();
      const deploymentId = data.deployment?.id || data.deploymentId;
      if (typeof deploymentId === "string") {
        onOpenChange(false);
        router.push(deploymentStatusPath(deploymentId));
        return;
      }
      throw new Error(data.error || "发布任务创建失败，请稍后重试");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "发布任务创建失败，请稍后重试");
      setPhase("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="release-experience max-h-[86vh] overflow-y-auto rounded-xl p-0 sm:max-w-[720px]">
        {phase === "preflight" && <>
          <DialogHeader className="border-b px-7 py-6 pr-14">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-[#10261C] text-[#22C55E]"><Rocket className="h-5 w-5" /></div>
            <DialogTitle className="text-xl">发布 v{versionNumber}</DialogTitle>
            <DialogDescription>检查当前版本并将它发布到稳定公开地址。确认后会进入独立状态页查看完整过程。</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-7 py-6">
            <div>
              <p className="mb-3 text-sm font-medium">发布前检查</p>
              <div className="overflow-hidden rounded-lg border">
                {checks.map((check, index) => <div key={check.label} className={`flex items-start gap-3 px-4 py-3.5 ${index ? "border-t" : ""}`}>
                  {check.status === "blocked" ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F0646E]" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22C55E]" />}
                  <div className="min-w-0"><p className="text-sm font-medium">{check.label}</p><p className="mt-0.5 text-sm text-muted-foreground">{check.detail}</p></div>
                </div>)}
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-4 py-3.5">
              <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div><p className="text-sm font-medium">旧版本会持续可用</p><p className="mt-1 text-sm leading-5 text-muted-foreground">新版本会先完成构建、启动和访问验证，只有全部通过才切换稳定地址；失败不会替换当前线上版本。</p></div>
            </div>
          </div>
          <DialogFooter className="border-t bg-muted/20 px-7 py-4"><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button onClick={startPublish} disabled={isBlocked} className="rounded-sm bg-[#22C55E] text-[#07110B] hover:bg-[#4ADE80]"><Rocket className="mr-2 h-4 w-4" />确认发布</Button></DialogFooter>
        </>}

        {phase === "submitting" && <div className="px-8 py-12"><DialogHeader className="items-center text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#11243A] text-[#4C9AFF]"><LoaderCircle className="h-7 w-7 animate-spin motion-reduce:animate-none" /></div><DialogTitle className="text-xl">正在创建发布任务</DialogTitle><DialogDescription>任务创建完成后会立即进入独立状态页，关闭页面不会取消后台发布。</DialogDescription></DialogHeader></div>}

        {phase === "error" && <><div className="px-8 py-10"><DialogHeader className="items-center text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#30171B] text-[#F0646E]"><AlertCircle className="h-7 w-7" /></div><DialogTitle className="text-xl">未能创建发布任务</DialogTitle><DialogDescription>后台任务尚未开始，当前线上版本没有受到影响。</DialogDescription></DialogHeader><div className="mt-6 rounded-lg border border-[#F0646E]/30 bg-[#30171B]/10 px-4 py-3 text-sm text-[#D94B57] dark:text-[#F0646E]">{errorMessage}</div></div><DialogFooter className="border-t bg-muted/20 px-7 py-4"><Button variant="ghost" onClick={() => setOpen(false)}>关闭</Button><Button onClick={() => setPhase("preflight")}><RotateCcw className="mr-2 h-4 w-4" />返回检查</Button></DialogFooter></>}
      </DialogContent>
    </Dialog>
  );
}
