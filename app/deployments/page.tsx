"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExternalLink, History, RefreshCw, Rocket, Undo2 } from "lucide-react";

interface Deployment {
  id: string;
  status: "BUILDING" | "ACTIVE" | "FAILED" | "SUPERSEDED" | "DISABLED";
  errorMessage?: string | null;
  createdAt: string;
  activatedAt?: string | null;
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

export default function DeploymentsPage() {
  const [projects, setProjects] = useState<PublishedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/deployments");
      if (!response.ok) throw new Error("加载失败");
      const data = await response.json();
      setProjects(data.projects || []);
    } catch {
      toast.error("发布列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (key: string, url: string) => {
    setPending(key);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      toast.success("操作成功");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold">发布中心</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看线上应用、发布历史并快速回滚
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">返回项目</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-5 px-6 py-8">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">加载中...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border bg-background py-20 text-center">
            <Rocket className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="font-medium">还没有发布记录</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              在项目预览工具栏中点击“发布”即可上线
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <article key={project.id} className="rounded-xl border bg-background p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold">{project.name}</h2>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        project.activeDeploymentId
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {project.activeDeploymentId ? "已上线" : "已下线"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {project.url}
                    {project.activeVersion ? ` · 当前 v${project.activeVersion}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${project.id}`}>继续编辑</Link>
                  </Button>
                  {project.activeDeploymentId && (
                    <Button asChild variant="outline" size="sm">
                      <a href={project.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-4 w-4" />访问
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={pending === `publish-${project.id}`}
                    onClick={() =>
                      action(
                        `publish-${project.id}`,
                        `/api/projects/${project.id}/deployments`,
                      )
                    }
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />重新发布最新版本
                  </Button>
                  {project.activeDeploymentId && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending === `off-${project.id}`}
                      onClick={() =>
                        action(
                          `off-${project.id}`,
                          `/api/projects/${project.id}/unpublish`,
                        )
                      }
                    >
                      下线
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t pt-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <History className="h-4 w-4" />发布历史
                </div>
                <div className="space-y-2">
                  {project.deployments.map((deployment) => (
                    <div
                      key={deployment.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          v{deployment.artifactVersion.versionNumber}
                        </span>
                        <span className="ml-3 text-muted-foreground">
                          {deployment.status} · {new Date(deployment.createdAt).toLocaleString()}
                        </span>
                        {deployment.errorMessage && (
                          <p className="mt-1 text-xs text-destructive">
                            {deployment.errorMessage}
                          </p>
                        )}
                      </div>
                      {deployment.status !== "FAILED" &&
                        deployment.id !== project.activeDeploymentId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending === deployment.id}
                            onClick={() =>
                              action(
                                deployment.id,
                                `/api/projects/${project.id}/deployments/${deployment.id}/activate`,
                              )
                            }
                          >
                            <Undo2 className="mr-1 h-4 w-4" />回滚到此版本
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
