"use client";

import Link from "next/link";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type UIEvent,
} from "react";
import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  LoaderCircle,
  Radio,
  RotateCcw,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  mergePublicationActivities,
  type JobPublicationActivity,
  type PublicationStage,
} from "@/lib/publishing/deployment-events";
import type { DeploymentStatusSnapshot } from "@/lib/publishing/deployment-status";
import {
  activityStreamReducer,
  RELEASE_STAGES,
} from "@/lib/publishing/realtime-ui";

const stageKeys: PublicationStage[] = [
  "preparing",
  "building",
  "uploading",
  "starting",
  "verifying",
  "switching",
];

type ConnectionState = "connecting" | "live" | "reconnecting" | "frozen";

function parseMessage<T>(event: Event): T | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "--:--:--";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function elapsed(snapshot: DeploymentStatusSnapshot) {
  const start = new Date(snapshot.startedAt || snapshot.createdAt).getTime();
  const end = snapshot.completedAt ? new Date(snapshot.completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "--";
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function StatusSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6 px-4 py-8 sm:px-8" aria-label="正在加载发布状态">
      <div className="h-5 w-40 rounded bg-[#CDD5DF] dark:bg-[#293241]" />
      <div className="rounded-xl border border-[#CDD5DF] bg-white p-8 dark:border-[#293241] dark:bg-[#11161F]">
        <div className="h-8 w-72 rounded bg-[#E4E8ED] dark:bg-[#202837]" />
        <div className="mt-4 h-4 w-96 max-w-full rounded bg-[#E4E8ED] dark:bg-[#202837]" />
        <div className="mt-8 h-2 rounded bg-[#E4E8ED] dark:bg-[#202837]" />
      </div>
      <div className="h-80 rounded-xl border border-[#CDD5DF] bg-white dark:border-[#293241] dark:bg-[#11161F]" />
    </div>
  );
}

function ActivityStream({
  activities,
  terminal,
  connection,
}: {
  activities: JobPublicationActivity[];
  terminal: boolean;
  connection: ConnectionState;
}) {
  const [open, setOpen] = useState(true);
  const [state, dispatch] = useReducer(activityStreamReducer, {
    following: true,
    unreadCount: 0,
    eventKeys: activities.map((event) => `${event.jobId}:${event.sequence}`),
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const keys = activities.map((event) => `${event.jobId}:${event.sequence}`);
    dispatch({ type: "append", eventKeys: keys });
  }, [activities]);

  useEffect(() => {
    if (!open || !state.following) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [activities.length, open, state.following]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    dispatch({ type: atBottom ? "follow" : "pause" });
  };

  const followLatest = () => {
    dispatch({ type: "follow" });
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
  };

  const copyLogs = async () => {
    const text = activities
      .map((event) => `${formatTime(event.timestamp)} ${event.level.toUpperCase()} [${RELEASE_STAGES[stageKeys.indexOf(event.stage)]}] ${event.message}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("技术日志已复制");
  };

  return (
    <section className="overflow-hidden rounded-lg border border-[#CDD5DF] bg-white dark:border-[#293241] dark:bg-[#11161F]" aria-labelledby="activity-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E8ED] px-4 py-3 dark:border-[#202837] sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="deployment-activity-log"
          className="flex items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C9AFF]"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <TerminalSquare className="h-4 w-4 text-[#4C9AFF]" />
          <span id="activity-title" className="text-sm font-semibold">发布活动</span>
          <span className="text-xs text-[#59677A] dark:text-[#9BA8BA]">{activities.length} 条</span>
        </button>
        <div className="flex items-center gap-3 text-xs">
          {connection === "reconnecting" && (
            <span role="status" className="flex items-center gap-1.5 text-[#D99A24] dark:text-[#F5B942]">
              <RotateCcw className="h-3.5 w-3.5" />正在恢复实时连接
            </span>
          )}
          {connection === "live" && (
            <span className="flex items-center gap-1.5 text-[#2E7DD1] dark:text-[#4C9AFF]">
              <Radio className="h-3.5 w-3.5" />实时
            </span>
          )}
          {terminal && <span className="text-[#59677A] dark:text-[#9BA8BA]">已冻结</span>}
          <button type="button" onClick={copyLogs} className="rounded-sm px-1 py-0.5 text-[#59677A] hover:text-[#18202B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C9AFF] dark:text-[#9BA8BA] dark:hover:text-[#E8EDF5]">
            <Copy className="mr-1 inline h-3.5 w-3.5" />复制日志
          </button>
        </div>
      </div>

      {open && (
        <div className="relative">
          <div
            id="deployment-activity-log"
            ref={viewportRef}
            onScroll={handleScroll}
            role="log"
            aria-label="发布技术日志"
            aria-live="off"
            tabIndex={0}
            className="release-terminal custom-scrollbar h-[360px] overflow-auto bg-[#0D1117] px-4 py-4 text-xs leading-[22px] text-[#C9D4E3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4C9AFF] sm:px-6"
          >
            {activities.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[#667386]">
                {terminal ? "这次发布没有产生实时日志" : "等待第一条发布活动…"}
              </div>
            ) : (
              activities.map((event) => (
                <div
                  key={`${event.jobId}:${event.sequence}`}
                  className={`grid min-w-[520px] grid-cols-[72px_62px_72px_1fr] gap-3 border-b border-[#202837]/70 py-1.5 last:border-0 ${
                    event.level === "error" ? "bg-[#30171B]/70 text-[#FF9BA3]" : ""
                  }`}
                >
                  <span className="text-[#667386]">{formatTime(event.timestamp)}</span>
                  <span className={event.level === "error" ? "font-semibold text-[#F0646E]" : event.level === "success" ? "text-[#22C55E]" : event.level === "warning" ? "text-[#F5B942]" : "text-[#4C9AFF]"}>
                    {event.level.toUpperCase()}
                  </span>
                  <span className="text-[#9BA8BA]">{RELEASE_STAGES[stageKeys.indexOf(event.stage)]}</span>
                  <span className="break-words">{event.message}</span>
                </div>
              ))
            )}
          </div>
          {!state.following && state.unreadCount > 0 && (
            <button
              type="button"
              onClick={followLatest}
              className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#22C55E] px-4 py-2 text-xs font-semibold text-[#07110B] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowDown className="h-3.5 w-3.5" />回到最新（{state.unreadCount}）
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function StageTimeline({ snapshot }: { snapshot: DeploymentStatusSnapshot }) {
  const currentIndex = stageKeys.indexOf(snapshot.progress.stage);
  return (
    <div className="mt-8" aria-label={`发布阶段：${snapshot.progress.stageLabel}`}>
      <div className="mb-3 flex items-center justify-between text-xs text-[#59677A] dark:text-[#9BA8BA]">
        <span>发布进度</span>
        <span className="font-mono">{snapshot.progress.progress}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[#E4E8ED] dark:bg-[#202837]">
        <div className="h-full rounded-full bg-[#4C9AFF] transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${snapshot.progress.progress}%` }} />
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {RELEASE_STAGES.map((label, index) => {
          const completed = snapshot.state === "success" || index < currentIndex;
          const current = index === currentIndex && snapshot.state !== "success";
          const failed = current && snapshot.state === "failed";
          return (
            <li key={label} className="flex items-center gap-2 text-xs">
              {completed ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22C55E]" aria-hidden />
              ) : failed ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-[#F0646E]" aria-hidden />
              ) : current ? (
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#4C9AFF] motion-reduce:animate-none" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-[#8B96A6] dark:text-[#667386]" aria-hidden />
              )}
              <span className={failed ? "font-medium text-[#D94B57] dark:text-[#F0646E]" : current ? "font-medium text-[#18202B] dark:text-[#E8EDF5]" : "text-[#59677A] dark:text-[#9BA8BA]"}>
                {label}{current ? ` · ${failed ? "未完成" : "进行中"}` : completed ? " · 完成" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DeploymentStatusView({ deploymentId }: { deploymentId: string }) {
  const [snapshot, setSnapshot] = useState<DeploymentStatusSnapshot | null>(null);
  const [activities, setActivities] = useState<JobPublicationActivity[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const source = new EventSource(`/api/deployments/${encodeURIComponent(deploymentId)}/events`);
    const loadTimeout = window.setTimeout(() => {
      setLoadError("实时状态连接超时，请检查登录状态或稍后重试。");
    }, 8_000);
    source.onopen = () => setConnection("live");
    source.addEventListener("snapshot", (event) => {
      const next = parseMessage<DeploymentStatusSnapshot>(event);
      if (!next) return;
      setSnapshot(next);
      setActivities(next.activities);
      setConnection(next.terminal ? "frozen" : "live");
      setLoadError("");
      window.clearTimeout(loadTimeout);
    });
    source.addEventListener("activity", (event) => {
      const activity = parseMessage<JobPublicationActivity>(event);
      if (!activity) return;
      setActivities((current) => mergePublicationActivities(current, [activity]));
    });
    source.addEventListener("status", (event) => {
      const status = parseMessage<Partial<DeploymentStatusSnapshot>>(event);
      if (!status) return;
      setSnapshot((current) => current ? {
        ...current,
        ...status,
        terminal: status.state ? status.state !== "running" : current.terminal,
      } : current);
    });
    source.addEventListener("complete", () => {
      setConnection("frozen");
      setSnapshot((current) => current ? { ...current, terminal: true } : current);
      source.close();
    });
    source.addEventListener("error", (event) => {
      const publicationError = parseMessage<{ title?: string; retryable?: boolean }>(event);
      if (publicationError && !publicationError.retryable) {
        setLoadError(publicationError.title || "发布状态暂时不可用");
      }
      if (source.readyState !== EventSource.CLOSED) setConnection("reconnecting");
    });
    return () => {
      window.clearTimeout(loadTimeout);
      source.close();
    };
  }, [deploymentId]);

  const liveAnnouncement = snapshot
    ? `${snapshot.progress.title}，${snapshot.progress.progress}%`
    : "正在加载发布状态";

  if (!snapshot && !loadError) return <StatusSkeleton />;
  if (!snapshot) {
    return (
      <div className="flex min-h-full items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-[#CDD5DF] bg-white p-8 text-center dark:border-[#293241] dark:bg-[#11161F]">
          <AlertCircle className="mx-auto h-8 w-8 text-[#F0646E]" />
          <h1 className="mt-4 text-xl font-semibold">无法打开发布状态</h1>
          <p className="mt-2 text-sm text-[#59677A] dark:text-[#9BA8BA]">{loadError}</p>
          <Button asChild variant="outline" className="mt-6"><Link href="/deployments">返回发布中心</Link></Button>
        </div>
      </div>
    );
  }

  const isSuccess = snapshot.state === "success";
  const isFailed = snapshot.state === "failed";
  const resultColor = isSuccess ? "text-[#16A34A] dark:text-[#22C55E]" : isFailed ? "text-[#D94B57] dark:text-[#F0646E]" : "text-[#2E7DD1] dark:text-[#4C9AFF]";

  const copyUrl = async () => {
    await navigator.clipboard.writeText(snapshot.publishedUrl);
    toast.success("公开地址已复制");
  };

  return (
    <main className="release-experience h-full overflow-y-auto overflow-x-hidden bg-[#F3F5F7] text-[#18202B] dark:bg-[#090C11] dark:text-[#E8EDF5]">
      <div aria-live="polite" aria-atomic="true" className="sr-only">{liveAnnouncement}</div>
      <header className="border-b border-[#CDD5DF] bg-white dark:border-[#293241] dark:bg-[#11161F]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/deployments" className="rounded-sm text-sm text-[#59677A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C9AFF] dark:text-[#9BA8BA]">← 发布中心</Link>
          <div className="flex items-center gap-2 text-xs text-[#59677A] dark:text-[#9BA8BA]">
            <span>{snapshot.projectName}</span><span>·</span><span className="font-mono">v{snapshot.versionNumber}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <section className="rounded-xl border border-[#CDD5DF] bg-white p-6 dark:border-[#293241] dark:bg-[#11161F] sm:p-8" aria-labelledby="deployment-result">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className={`mb-3 flex items-center gap-2 text-sm font-medium ${resultColor}`}>
                {isSuccess ? <CheckCircle2 className="h-4 w-4" /> : isFailed ? <AlertCircle className="h-4 w-4" /> : <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                {isSuccess ? "已上线" : isFailed ? "需要处理" : "正在发布"}
              </div>
              <h1 id="deployment-result" className="text-2xl font-semibold leading-9 sm:text-[28px]">{snapshot.progress.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59677A] dark:text-[#9BA8BA]">{snapshot.progress.detail}</p>
              {!isSuccess && (
                <p className="mt-3 text-sm font-medium text-[#18202B] dark:text-[#E8EDF5]">
                  {snapshot.previousVersionAvailable
                    ? "当前线上版本仍可正常访问，这次发布不会在验证通过前替换它。"
                    : "公开地址只会在新版本验证通过后开始提供访问。"}
                </p>
              )}
            </div>
            <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-[#E4E8ED] bg-[#F3F5F7] px-5 py-4 text-sm dark:border-[#202837] dark:bg-[#090C11]">
              <div><dt className="text-xs text-[#59677A] dark:text-[#9BA8BA]">当前阶段</dt><dd className="mt-1 font-medium">{snapshot.progress.stageLabel}</dd></div>
              <div><dt className="text-xs text-[#59677A] dark:text-[#9BA8BA]">用时</dt><dd className="release-terminal mt-1">{elapsed(snapshot)}</dd></div>
            </dl>
          </div>
          <StageTimeline snapshot={snapshot} />
        </section>

        {isSuccess && (
          <section className="rounded-lg border border-[#22C55E]/40 bg-[#10261C]/[0.06] p-6 dark:bg-[#10261C]" aria-labelledby="success-actions">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div className="min-w-0">
                <h2 id="success-actions" className="flex items-center gap-2 text-lg font-semibold"><Check className="h-5 w-5 text-[#22C55E]" />发布成功，可以交付了</h2>
                <p className="release-terminal mt-2 truncate text-sm text-[#59677A] dark:text-[#9BA8BA]" title={snapshot.publishedUrl}>{snapshot.publishedUrl}</p>
                <p className="mt-2 text-xs text-[#59677A] dark:text-[#9BA8BA]">v{snapshot.versionNumber} · 构建、启动和访问检查均已通过</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyUrl} className="rounded-sm bg-[#22C55E] text-[#07110B] hover:bg-[#4ADE80]"><Copy className="mr-2 h-4 w-4" />复制地址</Button>
                <Button asChild variant="outline" className="rounded-sm"><a href={snapshot.publishedUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />打开网站</a></Button>
                <Button asChild variant="ghost" className="rounded-sm"><Link href={`/projects/${snapshot.projectId}`}>继续修改</Link></Button>
              </div>
            </div>
          </section>
        )}

        {isFailed && snapshot.error && (
          <section className="rounded-lg border border-[#F0646E]/50 bg-[#30171B]/[0.06] p-6 dark:bg-[#30171B]" aria-labelledby="failure-title">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F0646E]" />
              <div className="min-w-0 flex-1">
                <h2 id="failure-title" className="text-lg font-semibold">{snapshot.error.title}</h2>
                <p className="mt-1 text-sm font-medium text-[#D94B57] dark:text-[#F0646E]">失败阶段：{snapshot.error.stageLabel}</p>
                <p className="mt-4 text-sm leading-6"><span className="font-semibold">原因：</span>{snapshot.error.cause}</p>
                <p className="mt-2 text-sm leading-6"><span className="font-semibold">建议：</span>{snapshot.error.recommendation}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild className="rounded-sm bg-[#22C55E] text-[#07110B] hover:bg-[#4ADE80]"><Link href={`/projects/${snapshot.projectId}?deploymentFailure=${encodeURIComponent(snapshot.deploymentId)}`}>返回项目并修复</Link></Button>
                  <Button variant="outline" className="rounded-sm" onClick={async () => { await navigator.clipboard.writeText(snapshot.error?.technicalMessage || ""); toast.success("错误详情已复制"); }}><Copy className="mr-2 h-4 w-4" />复制错误详情</Button>
                </div>
              </div>
            </div>
          </section>
        )}

        <ActivityStream activities={activities} terminal={snapshot.terminal} connection={connection} />
      </div>
    </main>
  );
}
