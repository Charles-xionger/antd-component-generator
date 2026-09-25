"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Table, LineChart, FileEdit, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InputBar } from "./input-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PresetPrompt {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  prompt: string;
}

const techStack = [
  "Ant Design",
  "Recharts",
  "TanStack Query",
  "Tailwind CSS",
  "TypeScript",
  "中英文",
];

const presetPrompts: PresetPrompt[] = [
  {
    icon: Table,
    title: "数据表格",
    description: "用户列表表格，带搜索和分页",
    prompt:
      "创建一个用户数据表格，包含姓名、邮箱、角色、状态字段。支持关键词搜索和分页功能。",
  },
  {
    icon: LineChart,
    title: "数据看板",
    description: "统计卡片与图表展示",
    prompt:
      "生成一个数据看板，包含3个统计卡片（总数、增长率、平均值）和一个折线图展示最近7天的趋势数据。",
  },
  {
    icon: FileEdit,
    title: "表单页面",
    description: "信息收集表单，带验证",
    prompt:
      "创建一个用户信息表单，包含姓名、邮箱、手机号、职位选择字段。添加表单验证和提交功能。",
  },
  {
    icon: LayoutGrid,
    title: "卡片网格",
    description: "响应式产品展示卡片",
    prompt:
      "生成一个产品展示网格，每个卡片包含图片、标题、价格、评分。支持响应式布局。",
  },
];

interface HomeLandingProps {
  onSubmit: (
    message: string,
    images?: { dataUrl: string; mime_type: string }[],
  ) => void;
}

export function HomeLanding({ onSubmit }: HomeLandingProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [images, setImages] = useState<
    { dataUrl: string; mime_type: string }[]
  >([]);

  // 模型选择状态（与 localStorage 同步）
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    // Initialize from localStorage on mount (client-side only)
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem("selectedModel");
      return !savedModel || savedModel === "qwen-plus"
        ? "qwen3.7-flash-2026-07-15"
        : savedModel;
    }
    return "qwen3.7-flash-2026-07-15";
  });

  // 持久化模型选择
  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  const handleSubmit = () => {
    if (input.trim() || images.length > 0) {
      console.log("[HomeLanding] 发送消息:", input.trim());
      console.log("[HomeLanding] 图片数量:", images.length);
      onSubmit(input.trim(), images);
      setInput(""); // 清空输入框
      setImages([]); // 清空图片
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-background overflow-auto">
      <div className="max-w-5xl w-full space-y-6">
        {/* 标题区 */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-2">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Antd Component Generator
          </h1>
          <p className="text-base text-muted-foreground">
            快速生成高质量的 React 组件，所见即所得
          </p>

          {/* 技术栈标签 */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {techStack.map((tech, index) => (
              <Badge
                key={index}
                variant="outline"
                className="px-2 py-0.5 text-xs font-normal"
              >
                {tech}
              </Badge>
            ))}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="flex items-center justify-center">
          <span className="text-sm font-medium text-muted-foreground">
            快速开始
          </span>
        </div>

        {/* 预设卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TooltipProvider>
            {presetPrompts.map((preset, index) => (
              <Tooltip key={index} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      console.log("[HomeLanding] 点击预设消息:", preset.title);
                      setInput(preset.prompt);
                      // 聚焦输入框
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="group relative flex items-start gap-4 rounded-lg border border-border bg-card p-5 text-left transition-all hover:shadow-md hover:bg-accent hover:border-primary w-full"
                  >
                    {/* 图标 */}
                    <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <preset.icon className="w-6 h-6 text-primary" />
                    </div>

                    {/* 标题和描述 */}
                    <div className="flex-1 space-y-1">
                      <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                        {preset.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm">
                  <p className="text-sm">{preset.prompt}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>

        {/* 输入框区域 */}
        <div className="relative">
          <InputBar
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isLoading={false}
            placeholder="描述你想要生成的组件..."
            images={images}
            onImagesChange={setImages}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>
    </div>
  );
}
