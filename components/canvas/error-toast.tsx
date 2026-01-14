// components/canvas/error-toast.tsx
"use client";

import { X, AlertCircle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorToastProps {
  error: string | null;
  onFix?: () => void;
  onDismiss?: () => void;
}

export function ErrorToast({ error, onFix, onDismiss }: ErrorToastProps) {
  // 直接根据 error 计算可见性，避免在 effect 中调用 setState
  const isVisible = !!error;

  const handleDismiss = () => {
    onDismiss?.();
  };

  if (!error) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <div className="bg-destructive/10 border-2 border-destructive/50 rounded-lg shadow-lg max-w-md backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="shrink-0 mt-0.5">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-destructive mb-1">
              渲染错误
            </h3>
            <p className="text-sm text-muted-foreground wrap-break-word whitespace-pre-wrap">
              {error}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        {onFix && (
          <div className="px-4 pb-4 pt-0">
            <Button
              onClick={() => {
                onFix();
              }}
              size="sm"
              className="w-full gap-2"
              variant="default"
            >
              <Wrench className="h-4 w-4" />
              自动修复
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
