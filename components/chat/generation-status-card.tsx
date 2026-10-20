"use client";

import { Check, Circle, Loader2, XCircle } from "lucide-react";
import {
  GENERATION_STAGE_META,
  GenerationStage,
  useGenerationStage,
  useGenerationSteps,
} from "@/stores/use-generation-store";

export function GenerationStatusCard() {
  const stage = useGenerationStage();
  const steps = useGenerationSteps();

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

  return (
    <div className="flex justify-start mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="w-full max-w-[85%] rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            {stage === GenerationStage.FAILED ? (
              <XCircle className="h-5 w-5" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{currentMeta.label}</div>
            <div className="text-xs text-muted-foreground">
              {currentMeta.description}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
          {visibleSteps.map((step) => {
            const meta = GENERATION_STAGE_META[step.stage];
            return (
              <div
                key={step.stage}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
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
                <span>{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
