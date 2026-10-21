"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Check, ChevronDown, Circle, FileCode2, LoaderCircle, TerminalSquare, TriangleAlert, X } from "lucide-react";
import { buildWorkspaceTurnItems, workspaceTurnHeading, type WorkspaceTurnItem, type WorkspaceTurnEvent } from "@/lib/workspace/turn-presentation";

type WorkspaceRunView = {
  id: string;
  status: string;
  summary: string | null;
  nextStep: number;
  maxSteps: number;
  createdAt?: string;
  updatedAt?: string;
};

type WorkspaceTurnProps = {
  run: WorkspaceRunView;
  events: WorkspaceTurnEvent[];
  error?: string | null;
  busy: boolean;
  onCancel: () => void;
  onOpenFile: (path: string) => void;
  availableFiles: string[];
};

type ItemRendererProps = { item: WorkspaceTurnItem; onOpenFile: (path: string) => void; availableFiles: Set<string> };

function NarrativeItem({ item }: ItemRendererProps) {
  if (item.kind !== "narrative") return null;
  return <p className="workspace-turn-narrative" data-tone={item.tone}>{item.text}</p>;
}

function PlanItem({ item }: ItemRendererProps) {
  if (item.kind !== "plan") return null;
  return (
    <div className="workspace-turn-plan">
      {item.summary && <p>{item.summary}</p>}
      <ol>
        {item.steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            {step.status === "completed" ? <Check size={14} /> : step.status === "in_progress" ? <LoaderCircle className="animate-spin" size={14} /> : <Circle size={11} />}
            <span>{step.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActivityItem({ item }: ItemRendererProps) {
  if (item.kind !== "activity") return null;
  return (
    <details className="workspace-turn-group">
      <summary><TerminalSquare size={15} />执行了 {item.entries.length} 项操作<ChevronDown className="workspace-turn-chevron" size={14} /></summary>
      <div className="workspace-turn-group-body">
        {item.entries.map((entry) => <div key={entry.sequence}><p>{entry.label}</p>{entry.output && <pre>{entry.output}</pre>}</div>)}
      </div>
    </details>
  );
}

function FilesItem({ item, onOpenFile, availableFiles }: ItemRendererProps) {
  if (item.kind !== "files") return null;
  return (
    <div className="workspace-turn-files">
      <p><FileCode2 size={15} />修改了 {item.files.length} 个文件</p>
      <div>{item.files.map((file) => availableFiles.has(file.path)
        ? <button type="button" key={file.path} onClick={() => onOpenFile(file.path)}>{file.path}<span>r{file.revision}</span></button>
        : <span className="workspace-turn-file" key={file.path}>{file.path}<span>r{file.revision}</span></span>)}</div>
    </div>
  );
}

function ValidationItem({ item }: ItemRendererProps) {
  if (item.kind !== "validation") return null;
  return <p className="workspace-turn-validation" data-passed={item.passed}>{item.passed ? <Check size={15} /> : <TriangleAlert size={15} />}{item.passed ? "代码检查通过" : `代码检查发现 ${item.diagnosticCount} 项问题`}</p>;
}

function DiagnosticsItem({ item, onOpenFile, availableFiles }: ItemRendererProps) {
  if (item.kind !== "diagnostics") return null;
  return (
    <div className="workspace-turn-diagnostics">
      {item.diagnostics.map((diagnostic) => (
        <details key={diagnostic.sequence}>
          <summary><TriangleAlert size={14} /><span>{diagnostic.file ? `${diagnostic.file}: ` : ""}{diagnostic.message}</span><ChevronDown className="workspace-turn-chevron" size={14} /></summary>
          {diagnostic.file && availableFiles.has(diagnostic.file) && <button type="button" onClick={() => onOpenFile(diagnostic.file!)}>打开文件</button>}
          {diagnostic.detail && <pre>{diagnostic.detail}</pre>}
        </details>
      ))}
    </div>
  );
}

function ResultItem({ item }: ItemRendererProps) {
  if (item.kind !== "result") return null;
  return <p className="workspace-turn-result" data-tone={item.tone}>{item.tone === "success" ? <Check size={16} /> : item.tone === "error" ? <X size={16} /> : item.tone === "warning" ? <TriangleAlert size={16} /> : <Circle size={12} />}{item.text}</p>;
}

const itemRenderers: Record<WorkspaceTurnItem["kind"], ComponentType<ItemRendererProps>> = {
  narrative: NarrativeItem,
  plan: PlanItem,
  activity: ActivityItem,
  files: FilesItem,
  validation: ValidationItem,
  diagnostics: DiagnosticsItem,
  result: ResultItem,
};

function elapsedLabel(createdAt?: string, updatedAt?: string, active = false, now = Date.now()) {
  if (!createdAt) return active ? "正在工作" : "执行记录";
  const start = new Date(createdAt).getTime();
  const end = active ? now : new Date(updatedAt || createdAt).getTime();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return active ? `已运行 ${seconds} 秒` : `运行了 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${active ? "已运行" : "运行了"} ${minutes} 分 ${remainder} 秒`;
}

export function WorkspaceTurn({ run, events, error, busy, onCancel, onOpenFile, availableFiles }: WorkspaceTurnProps) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!busy) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const items = useMemo(() => buildWorkspaceTurnItems(run, events), [run, events]);
  const files = useMemo(() => new Set(availableFiles), [availableFiles]);

  return (
    <section className="workspace-turn" data-status={run.status} aria-label="工作区任务">
      <div className="workspace-turn-header">
        <div><span className="workspace-turn-status-dot" aria-hidden="true" /><div><strong>{workspaceTurnHeading(run.status)}</strong><span>{elapsedLabel(run.createdAt, run.updatedAt, busy, now ?? new Date(run.createdAt || run.updatedAt || 0).getTime())} · 已完成 {run.nextStep} 个步骤</span></div></div>
        {busy && <button type="button" className="workspace-turn-cancel" onClick={onCancel}>停止</button>}
      </div>
      <div className="workspace-turn-items">
        {items.map((item) => {
          const Renderer = itemRenderers[item.kind];
          return <Renderer key={item.id} item={item} onOpenFile={onOpenFile} availableFiles={files} />;
        })}
      </div>
      {error && <p role="alert" className="workspace-turn-sync-error">{error}</p>}
    </section>
  );
}
