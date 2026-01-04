// components/canvas/canvas-card.tsx
"use client";

import { Code2, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ParsedFile } from "./types";

interface CanvasCardProps {
  artifact: {
    id: string;
    title: string;
    files: ParsedFile[];
  };
  onExpand: () => void;
  isLoading?: boolean;
}

export function CanvasCard({
  artifact,
  onExpand,
  isLoading = false,
}: CanvasCardProps) {
  return (
    <Card
      onClick={onExpand}
      className={`cursor-pointer transition-all hover:shadow-md ${
        isLoading ? "border-primary bg-primary/5" : ""
      }`}
    >
      <CardContent className="p-6">
        {/* 图标和标题区域 */}
        <div className="mb-4 flex items-start gap-4">
          <div
            className={`shrink-0 rounded-lg p-3 ${
              isLoading ? "bg-primary shadow-lg" : "bg-primary"
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
            ) : (
              <Code2 className="h-5 w-5 text-primary-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold mb-2">{artifact.title}</h3>
            {isLoading && (
              <div className="flex items-center gap-2">
                <div className="h-1 w-16 bg-primary/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-3/4" />
                </div>
                <span className="text-sm text-primary">生成中...</span>
              </div>
            )}
          </div>
        </div>

        {/* 操作区域 */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "正在生成代码..." : "点击查看和编辑"}
          </p>
          <div className="flex items-center gap-1 text-primary">
            <span className="text-sm font-medium">打开</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
