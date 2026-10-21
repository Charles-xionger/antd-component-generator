"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, CircleOff, ExternalLink, History, LoaderCircle, Radio, RefreshCw, Rocket, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deploymentStatusPath, getProjectReleaseState, releaseConfirmationCopy, type ProjectReleaseState } from "@/lib/publishing/realtime-ui";

interface Deployment {
  id: string;
  status: "BUILDING" | "ACTIVE" | "FAILED" | "SUPERSEDED" | "DISABLED";
  errorMessage?: string | null;
  createdAt: string;
  artifactVersion: { versionNumber: number };
}

interface PublishedProject {
  id: string;
  name: string;
  url: string;
  activeDeploymentId?: string | null;
  activeVersion?: number | null;
  deployments: Deployment[];
}

const stateMeta: Record<ProjectReleaseState, { label: string; detail: string; className: string }> = {
  online: { label: "线上正常", detail: "稳定地址正在提供访问", className: "text-[#16A34A] dark:text-[#22C55E]" },
  publishing: { label: "正在发布", detail: "新版本正在隔离构建和验证", className: "text-[#2E7DD1] dark:text-[#4C9AFF]" },
  attention: { label: "需要处理", detail: "最近一次发布未完成，线上旧版本不受影响", className: "text-[#D94B57] dark:text-[#F0646E]" },
  offline: { label: "已下线", detail: "公开地址当前不可访问，数据和版本仍保留", className: "text-[#59677A] dark:text-[#9BA8BA]" },
};

function ReleaseSkeleton() {
  return <div className="space-y-4" aria-label="正在加载发布项目">{[0, 1].map((item) => <div key={item} className="animate-pulse rounded-xl border border-[#CDD5DF] bg-white p-6 dark:border-[#293241] dark:bg-[#11161F]"><div className="h-6 w-48 rounded bg-[#E4E8ED] dark:bg-[#202837]" /><div className="mt-4 h-4 w-80 max-w-full rounded bg-[#E4E8ED] dark:bg-[#202837]" /><div className="mt-6 h-10 rounded bg-[#F3F5F7] dark:bg-[#090C11]" /></div>)}</div>;
}

function StateIcon({ state }: { state: ProjectReleaseState }) {
  if (state === "online") return <CheckCircle2 className="h-4 w-4" />;
  if (state === "publishing") return <Radio className="h-4 w-4" />;
  if (state === "attention") return <AlertCircle className="h-4 w-4" />;
  return <CircleOff className="h-4 w-4" />;
}

export default function DeploymentsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PublishedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/deployments");
      if (!response.ok) throw new Error("加载失败");
      const data = await response.json();
      setProjects(data.projects || []);
    } catch {
      setLoadError("无法加载发布项目，请检查登录状态或稍后重试。");
      toast.error("发布列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const postAction = async (key: string, url: string, navigate = false) => {
    setPending(key);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = await response.json();
      const deploymentId = data.deployment?.id || data.deploymentId;
      if (navigate && typeof deploymentId === "string") {
        router.push(deploymentStatusPath(deploymentId));
        return;
      }
      if (!response.ok) throw new Error(data.error || "操作失败");
      toast.success("操作已完成");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="release-experience h-screen overflow-y-auto overflow-x-hidden bg-[#F3F5F7] text-[#18202B] dark:bg-[#090C11] dark:text-[#E8EDF5]">
      <header className="border-b border-[#CDD5DF] bg-white dark:border-[#293241] dark:bg-[#11161F]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
          <div><h1 className="text-2xl font-semibold">发布中心</h1><p className="mt-1 text-sm text-[#59677A] dark:text-[#9BA8BA]">先看每个项目现在是否在线，再按需查看发布记录</p></div>
          <Button asChild variant="outline" className="rounded-sm"><Link href="/">返回项目</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {loading ? <ReleaseSkeleton /> : loadError ? (
          <div className="rounded-xl border border-[#F0646E]/40 bg-white px-6 py-16 text-center dark:bg-[#11161F]">
            <AlertCircle className="mx-auto h-8 w-8 text-[#F0646E]" />
            <h2 className="mt-4 text-lg font-semibold">发布中心暂时不可用</h2>
            <p className="mt-2 text-sm text-[#59677A] dark:text-[#9BA8BA]">{loadError}</p>
            <Button variant="outline" className="mt-6 rounded-sm" onClick={() => { setLoading(true); void load(); }}>重新加载</Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-[#CDD5DF] bg-white px-6 py-20 text-center dark:border-[#293241] dark:bg-[#11161F]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#CDD5DF] bg-[#F3F5F7] dark:border-[#293241] dark:bg-[#090C11]"><Rocket className="h-6 w-6 text-[#4C9AFF]" /></div>
            <h2 className="mt-5 text-lg font-semibold">发布第一个应用</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#59677A] dark:text-[#9BA8BA]">还没有发布项目。在项目预览中完成可用性检查，然后点击“发布”即可获得稳定公开地址。</p>
            <Button asChild className="mt-6 rounded-sm bg-[#22C55E] text-[#07110B] hover:bg-[#4ADE80]"><Link href="/">返回项目开始发布</Link></Button>
          </div>
        ) : <div className="space-y-4">{projects.map((project) => {
          const latest = project.deployments[0];
          const state = getProjectReleaseState({ activeDeploymentId: project.activeDeploymentId, latestStatus: latest?.status });
          const baseMeta = stateMeta[state];
          const meta = state === "attention" && !project.activeDeploymentId
            ? { ...baseMeta, detail: "最近一次发布未完成，公开地址尚未上线" }
            : baseMeta;
          const historyOpen = Boolean(expanded[project.id]);
          const rollbackCopy = releaseConfirmationCopy("rollback");
          const unpublishCopy = releaseConfirmationCopy("unpublish");
          return (
            <article key={project.id} className="overflow-hidden rounded-xl border border-[#CDD5DF] bg-white dark:border-[#293241] dark:bg-[#11161F]">
              <div className="p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{project.name}</h2><span className={`flex items-center gap-1.5 rounded-full border border-current/20 px-2.5 py-1 text-xs font-medium ${meta.className}`}><StateIcon state={state} />{meta.label}</span></div>
                    <p className="mt-2 text-sm text-[#59677A] dark:text-[#9BA8BA]">{meta.detail}</p>
                    <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#59677A] dark:text-[#9BA8BA]"><span className="release-terminal max-w-full truncate" title={project.url}>{project.url}</span><span>{project.activeVersion ? `当前 v${project.activeVersion}` : "暂无线上版本"}</span>{latest && <span>最近更新 {new Date(latest.createdAt).toLocaleString("zh-CN")}</span>}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(state === "publishing" || state === "attention") && latest && <Button asChild className={`rounded-sm ${state === "attention" ? "bg-[#F0646E] text-white hover:bg-[#D94B57]" : "bg-[#4C9AFF] text-white hover:bg-[#2E7DD1]"}`}><Link href={deploymentStatusPath(latest.id)}>{state === "publishing" ? "查看实时进度" : "查看并解决"}</Link></Button>}
                    {state === "online" && <Button asChild className="rounded-sm bg-[#22C55E] text-[#07110B] hover:bg-[#4ADE80]"><a href={project.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />打开网站</a></Button>}
                    <Button asChild variant="outline" className="rounded-sm"><Link href={`/projects/${project.id}`}>继续修改</Link></Button>
                    <Button variant="outline" className="rounded-sm" disabled={state === "publishing" || pending === `publish-${project.id}`} onClick={() => postAction(`publish-${project.id}`, `/api/projects/${project.id}/deployments`, true)}>{pending === `publish-${project.id}` ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{state === "publishing" ? "发布进行中" : "重新发布"}</Button>
                    {project.activeDeploymentId && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="rounded-sm text-[#D94B57] dark:text-[#F0646E]">下线</Button></AlertDialogTrigger><AlertDialogContent className="rounded-xl border-[#CDD5DF] dark:border-[#293241]"><AlertDialogHeader><AlertDialogTitle>{unpublishCopy.title}</AlertDialogTitle><AlertDialogDescription className="leading-6">{unpublishCopy.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction className="bg-[#F0646E] text-white hover:bg-[#D94B57]" onClick={() => postAction(`off-${project.id}`, `/api/projects/${project.id}/unpublish`)}>{unpublishCopy.confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#E4E8ED] dark:border-[#202837]">
                <button type="button" aria-expanded={historyOpen} aria-controls={`history-${project.id}`} onClick={() => setExpanded((current) => ({ ...current, [project.id]: !historyOpen }))} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4C9AFF] sm:px-6"><span className="flex items-center gap-2 font-medium"><History className="h-4 w-4 text-[#59677A] dark:text-[#9BA8BA]" />发布记录 <span className="font-normal text-[#59677A] dark:text-[#9BA8BA]">{project.deployments.length} 次</span></span>{historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                {historyOpen && <div id={`history-${project.id}`} className="border-t border-[#E4E8ED] bg-[#F3F5F7] p-3 dark:border-[#202837] dark:bg-[#090C11] sm:p-4"><div className="space-y-2">{project.deployments.map((deployment) => (
                  <div key={deployment.id} className="flex flex-col justify-between gap-3 rounded-lg border border-[#CDD5DF] bg-white px-4 py-3 text-sm dark:border-[#293241] dark:bg-[#11161F] sm:flex-row sm:items-center">
                    <Link href={deploymentStatusPath(deployment.id)} className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C9AFF]"><span className="release-terminal font-medium">v{deployment.artifactVersion.versionNumber}</span><span className="ml-3 text-[#59677A] dark:text-[#9BA8BA]">{deployment.status === "ACTIVE" ? "发布成功" : deployment.status === "FAILED" ? "发布未完成" : deployment.status === "BUILDING" ? "正在发布" : deployment.status === "DISABLED" ? "已下线" : "历史版本"} · {new Date(deployment.createdAt).toLocaleString("zh-CN")}</span>{deployment.errorMessage && <p className="mt-1 line-clamp-2 text-xs text-[#D94B57] dark:text-[#F0646E]">{deployment.errorMessage}</p>}</Link>
                    {deployment.status !== "FAILED" && deployment.status !== "BUILDING" && deployment.id !== project.activeDeploymentId && <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="shrink-0 rounded-sm"><Undo2 className="mr-1.5 h-4 w-4" />回滚到此版本</Button></AlertDialogTrigger><AlertDialogContent className="rounded-xl border-[#CDD5DF] dark:border-[#293241]"><AlertDialogHeader><AlertDialogTitle>{rollbackCopy.title}</AlertDialogTitle><AlertDialogDescription className="leading-6">将 {project.name} 回滚到 v{deployment.artifactVersion.versionNumber}。{rollbackCopy.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction className="bg-[#22C55E] text-[#07110B] hover:bg-[#4ADE80]" onClick={() => postAction(deployment.id, `/api/projects/${project.id}/deployments/${deployment.id}/activate`, true)}>{rollbackCopy.confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
                  </div>
                ))}</div></div>}
              </div>
            </article>
          );
        })}</div>}
      </section>
    </main>
  );
}
