// components/chat/generation-status-card.tsx
"use client";

import { Loader2 } from "lucide-react";
import {
  useIsGenerating,
  useGenerationStage,
  GenerationStage,
} from "@/stores/use-generation-store";

export function GenerationStatusCard() {
  const isGenerating = useIsGenerating();
  const stage = useGenerationStage();

  // 不在生成中时不显示，或者在普通的思考阶段也不显示（避免简单的问答也显示大卡片）
  if (!isGenerating || stage === GenerationStage.THINKING || stage === GenerationStage.IDLE) {
    return null;
  }

  return (
    <div className="flex justify-start mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            正在生成内容
          </span>
          <span className="text-xs text-blue-700/80 dark:text-blue-300/80">
            AI 正在分析需求并编写代码...
          </span>
        </div>
      </div>
    </div>
  );
}
