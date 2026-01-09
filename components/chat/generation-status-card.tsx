// components/chat/generation-status-card.tsx
"use client";

import { Sparkles, Code2, Lightbulb } from "lucide-react";
import {
  useIsGenerating,
  useGenerationStage,
  GenerationStage,
} from "@/stores/use-generation-store";

export function GenerationStatusCard() {
  const isGenerating = useIsGenerating();
  const stage = useGenerationStage();

  // 不在生成中时不显示
  if (!isGenerating) {
    return null;
  }

  // 根据阶段选择图标、文本和颜色
  const stageConfig = {
    [GenerationStage.ARCHITECT]: {
      icon: Lightbulb,
      text: "正在分析需求和规划架构",
      subtext: "AI 正在理解你的需求，设计最佳实现方案...",
      color: "text-yellow-500",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
      borderColor: "border-yellow-200 dark:border-yellow-800",
      dotColor: "bg-yellow-500",
    },
    [GenerationStage.CODING]: {
      icon: Code2,
      text: "正在生成代码",
      subtext: "AI 正在编写高质量的代码文件...",
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      borderColor: "border-blue-200 dark:border-blue-800",
      dotColor: "bg-blue-500",
    },
    [GenerationStage.IDLE]: {
      icon: Sparkles,
      text: "准备中",
      subtext: "正在初始化...",
      color: "text-gray-500",
      bgColor: "bg-gray-50 dark:bg-gray-950",
      borderColor: "border-gray-200 dark:border-gray-800",
      dotColor: "bg-gray-500",
    },
  };

  const config = stageConfig[stage];
  const Icon = config.icon;

  return (
    <div className="flex justify-start mb-4">
      <div
        className={`max-w-[85%] rounded-lg border ${config.borderColor} ${config.bgColor} px-4 py-3 shadow-sm`}
      >
        <div className="flex items-start gap-3">
          {/* 图标 */}
          <div className="relative mt-0.5">
            <Icon className={`h-5 w-5 ${config.color}`} />
            {/* 脉动效果 */}
            <span
              className={`absolute -top-1 -right-1 flex h-2 w-2 ${config.dotColor} rounded-full animate-pulse`}
            />
          </div>

          {/* 文本内容 */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {config.text}
              </span>
              {/* 动画点点点 */}
              <span className="flex gap-1">
                <span
                  className={`w-1 h-1 ${config.dotColor} rounded-full animate-bounce`}
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className={`w-1 h-1 ${config.dotColor} rounded-full animate-bounce`}
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className={`w-1 h-1 ${config.dotColor} rounded-full animate-bounce`}
                  style={{ animationDelay: "300ms" }}
                />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{config.subtext}</p>
          </div>
        </div>

        {/* 进度条 */}
        <div className="mt-3 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${config.dotColor} rounded-full animate-pulse`}
            style={{
              width: stage === GenerationStage.ARCHITECT ? "40%" : "75%",
              transition: "width 0.5s ease-in-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
