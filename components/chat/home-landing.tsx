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
    title: "高级数据表格",
    description: "带搜索、筛选、排序和批量操作",
    prompt:
      "创建一个高级用户管理表格，包含头像、姓名、角色（标签显示）、状态（徽标显示）、最后登录时间等字段。功能要求：支持分页、列排序、多条件筛选（角色/状态）、关键词搜索、行多选批量操作（批量删除/导出）。操作栏包含编辑、删除、重置密码按钮，删除需二次确认。",
  },
  {
    icon: LineChart,
    title: "销售数据看板",
    description: "多维度数据可视化分析",
    prompt:
      "生成一个销售数据分析看板，包含三个核心指标卡片（总销售额、订单量、客单价，带环比增长率）。下方展示一个组合图表（折线图+柱状图），展示近 30 天的销售额和订单量趋势，支持时间范围筛选（近7天/近30天/本月）。包含数据加载状态和空数据展示。",
  },
  {
    icon: FileEdit,
    title: "分步注册表单",
    description: "复杂表单验证与步骤条",
    prompt:
      "创建一个分步注册流程表单：第一步账户信息（用户名、邮箱、密码强度检测）；第二步个人资料（头像上传、职位选择、技能标签输入）；第三步确认信息。包含步骤条导航，每一步都有严格的表单验证，支持上一步/下一步切换，最后提交显示成功结果页。",
  },
  {
    icon: LayoutGrid,
    title: "商品展示卡片",
    description: "响应式网格与交互操作",
    prompt:
      "生成一个电商商品展示网格，每个卡片包含：商品图片（带悬停放大效果）、标题、描述（两行省略）、价格（原价/现价）、评分星级、销量。卡片底部包含加入购物车和收藏按钮。右上角显示新品/热销标签。支持响应式布局（手机单列/平板双列/桌面四列）。",
  },
];

interface HomeLandingProps {
  onSubmit: (
    message: string,
    images?: { dataUrl: string; mime_type: string }[]
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
      return localStorage.getItem("selectedModel") || "qwen-plus";
    }
    return "qwen-plus";
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
