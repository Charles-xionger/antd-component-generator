"use client";

import { useState, useEffect } from "react";
import { Sparkles, Table, LineChart, FileEdit, LayoutGrid } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InputBar } from "./input-bar";

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
    description: "带分页、排序和搜索",
    prompt:
      "创建一个用户数据表格组件，包含姓名、邮箱、角色、状态等字段，支持分页、排序和搜索功能，使用 Ant Design Table 组件",
  },
  {
    icon: LineChart,
    title: "数据可视化",
    description: "Recharts 图表",
    prompt:
      "生成一个 Recharts 折线图组件，展示最近7天的销售数据趋势，包含图例、工具提示和响应式布局，使用平滑的曲线样式",
  },
  {
    icon: FileEdit,
    title: "表单组件",
    description: "验证和提交",
    prompt:
      "创建一个用户注册表单，包含用户名、邮箱、密码、确认密码字段，使用 Ant Design Form 组件，带实时验证、错误提示和表单提交功能",
  },
  {
    icon: LayoutGrid,
    title: "卡片布局",
    description: "响应式网格",
    prompt:
      "生成一个产品卡片网格布局，每个卡片包含图片、标题、价格、标签和购买按钮，支持响应式布局，使用 Ant Design Card 和 Grid 组件",
  },
];

interface HomeLandingProps {
  onSubmit: (message: string) => void;
}

export function HomeLanding({ onSubmit }: HomeLandingProps) {
  const [input, setInput] = useState("");

  // 模型选择状态（与 localStorage 同步）
  const [selectedModel, setSelectedModel] = useState<string>("qwen-plus");

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    const saved = localStorage.getItem("selectedModel");
    if (saved) {
      setSelectedModel(saved);
    }
  }, []);

  // 持久化模型选择
  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  const handleSubmit = () => {
    if (input.trim()) {
      console.log("[HomeLanding] 发送消息:", input.trim());
      onSubmit(input.trim());
      setInput(""); // 清空输入框
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
          {presetPrompts.map((preset, index) => (
            <button
              key={index}
              onClick={() => {
                console.log("[HomeLanding] 点击预设消息:", preset.title);
                setInput(preset.prompt);
              }}
              className="group relative flex items-start gap-4 rounded-lg border border-border bg-card p-5 text-left transition-all hover:shadow-md hover:bg-accent hover:border-primary"
            >
              {/* 图标 */}
              <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <preset.icon className="w-6 h-6 text-primary" />
              </div>

              {/* 标题和描述 */}
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                  {preset.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {preset.prompt}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* 输入框区域 */}
        <div className="relative">
          <InputBar
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isLoading={false}
            placeholder="描述你想要生成的组件..."
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>
    </div>
  );
}
