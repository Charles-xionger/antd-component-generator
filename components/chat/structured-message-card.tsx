"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileCode2,
  LayoutDashboard,
  Route,
  Users,
} from "lucide-react";
import { Streamdown } from "streamdown";
import {
  objectList,
  type StructuredMessagePayload,
  stringList,
} from "@/lib/chat/structured-message";

function TextList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-foreground">{title}</div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SurroundingText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground">
      <Streamdown className="prose prose-sm max-w-none">{text}</Streamdown>
    </div>
  );
}

function RequirementCard({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const confirmed = data.confirmed === true;
  const name = String(data.name || "应用需求规格");
  const goal = String(data.goal || "");
  const actors = stringList(data.actors);
  const workflows = stringList(data.workflows);
  const rules = stringList(data.businessRules);
  const criteria = stringList(data.acceptanceCriteria);
  const entities = stringList(data.entities);
  const outOfScope = stringList(data.outOfScope);

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-accent/50"
      >
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  confirmed
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {confirmed ? "方向已确认" : "请确认方向"}
              </span>
            </div>
            {goal && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {goal}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />谁使用：{actors.join("、") || "业务用户"}</span>
              <span className="flex items-center gap-1"><Route className="h-3 w-3" />{workflows.length} 个核心动作</span>
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="grid gap-4 border-t bg-muted/30 px-4 py-4 md:grid-cols-2">
          <TextList title="谁来使用" items={actors} />
          <TextList title="如何完成工作" items={workflows} />
          <TextList title="需要处理的信息" items={entities} />
          <TextList title="采用的默认规则" items={rules} />
          <TextList title="第一版暂不包含" items={outOfScope} />
          <div className="md:col-span-2">
            <TextList title="做到什么算可用" items={criteria} />
          </div>
        </div>
      )}
    </div>
  );
}

function BlueprintCard({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const product =
    data.product && typeof data.product === "object"
      ? (data.product as Record<string, unknown>)
      : {};
  const name = String(product.name || "应用方案");
  const goal = String(product.goal || product.description || "");
  const pages = objectList(data.pages);
  const entities = objectList(data.entities);
  const operations = objectList(data.operations);
  const scenarios = objectList(data.testScenarios);
  const runtimeType = data.runtimeType === "STATIC" ? "单页应用" : "数据应用";

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-accent/50"
      >
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <FileCode2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{name}</span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {runtimeType}
              </span>
            </div>
            {goal && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{goal}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><LayoutDashboard className="h-3 w-3" />{pages.length} 个工作页面</span>
              <span className="flex items-center gap-1"><Route className="h-3 w-3" />{operations.length} 个核心操作</span>
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="grid gap-4 border-t bg-muted/30 px-4 py-4 md:grid-cols-2">
          <TextList title="工作页面" items={stringList(pages)} />
          <TextList title="需要保存的信息" items={stringList(entities)} />
          <TextList
            title="核心操作"
            items={operations.map((item) =>
              String(item.description || item.id || ""),
            )}
          />
          <TextList title="可用性检查" items={stringList(scenarios)} />
        </div>
      )}
    </div>
  );
}

export function StructuredMessageCard({
  payload,
}: {
  payload: StructuredMessagePayload;
}) {
  return (
    <div className="flex justify-start group">
      <div className="w-full max-w-[85%] space-y-3">
        <SurroundingText text={payload.before} />
        {payload.kind === "requirement" ? (
          <RequirementCard data={payload.data} />
        ) : (
          <BlueprintCard data={payload.data} />
        )}
        <SurroundingText text={payload.after} />
      </div>
    </div>
  );
}

export function StructuredMessageLoadingCard({
  kind,
}: {
  kind: StructuredMessagePayload["kind"];
}) {
  const requirement = kind === "requirement";
  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[85%] items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div
          className={`rounded-lg p-2 ${
            requirement
              ? "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
              : "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
          }`}
        >
          {requirement ? (
            <ClipboardCheck className="h-4 w-4 animate-pulse" />
          ) : (
            <FileCode2 className="h-4 w-4 animate-pulse" />
          )}
        </div>
        <div>
          <div className="text-sm font-medium">
            {requirement ? "正在收敛第一版方向" : "正在规划最小可用应用"}
          </div>
          <div className="text-xs text-muted-foreground">
            {requirement
              ? "识别谁在什么场景下完成什么工作"
              : "只保留完成核心工作需要的页面和操作"}
          </div>
        </div>
      </div>
    </div>
  );
}
