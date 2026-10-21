"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ListChecks,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  GENERATION_STAGE_META,
  GenerationStage,
  useGenerationStage,
  useGenerationSteps,
} from "@/stores/use-generation-store";
import { buildPlanSummary } from "@/lib/chat/item-presentation";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function GenerationStatusCard() {
  const stage = useGenerationStage();
  const steps = useGenerationSteps();
  const [open, setOpen] = useState(true);

  if (stage === GenerationStage.IDLE || steps.length === 0) return null;

  const currentMeta = GENERATION_STAGE_META[stage];
  const compactStages = new Set([
    GenerationStage.INTENT,
    GenerationStage.REQUIREMENTS,
    GenerationStage.RESPONDING,
    GenerationStage.AWAITING_CONFIRMATION,
  ]);

  if (compactStages.has(stage)) {
    return (
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
        <span>{currentMeta.label}…</span>
      </div>
    );
  }

  const visibleSteps = steps.filter((step) =>
    [
      GenerationStage.ARCHITECTURE,
      GenerationStage.CODING,
      GenerationStage.VALIDATING,
      GenerationStage.REPAIRING,
    ].includes(step.stage),
  );
  const plan = buildPlanSummary(steps);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-4 w-full max-w-[92%] animate-in overflow-hidden rounded-xl border bg-card fade-in slide-in-from-bottom-2 duration-300"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-label={`${open ? "收起" : "展开"}执行计划，已完成 ${plan.completed} 项，共 ${plan.total} 项`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              {stage === GenerationStage.FAILED ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                执行计划
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {plan.label}
                </span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {currentMeta.label} · {currentMeta.description}
              </span>
            </span>
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t bg-muted/20 px-4 py-3">
        <div className="space-y-2">
          {visibleSteps.map((step) => {
            const meta = GENERATION_STAGE_META[step.stage];
            return (
              <div
                key={step.stage}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                {step.status === "completed" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : step.status === "failed" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : step.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                <span>
                  <span className="font-medium text-foreground">{meta.label}</span>
                  <span className="ml-2">{meta.description}</span>
                </span>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
