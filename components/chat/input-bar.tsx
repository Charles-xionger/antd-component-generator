// components/chat/input-bar.tsx
"use client";

import {
  KeyboardEvent,
  useRef,
  useEffect,
  ChangeEvent,
  useState,
  forwardRef,
} from "react";
import Image from "next/image";
import {
  Loader2,
  Plus,
  Settings2,
  ChevronDown,
  ArrowUp,
  X,
  Cpu,
} from "lucide-react";
import { type MCPConfig } from "@/components/mcp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MCPConfigPanel } from "@/components/mcp/config-panel";
import { useIsGenerating } from "@/stores/use-generation-store";

interface ImageItem {
  dataUrl: string;
  mime_type: string;
}

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  isCanvasMode?: boolean;
  placeholder?: string;
  images?: ImageItem[];
  onImagesChange?: (images: ImageItem[]) => void;

  // MCP 相关的 Props
  mcpConfigs?: MCPConfig[];
  selectedMcpId?: string | null;
  isMcpLoading?: boolean;
  onMcpSelect?: (id: string | null) => void;
  onMcpRefresh?: () => void;

  // 模型选择相关的 Props
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

function FileUploadButton({
  onFileSelect,
}: {
  onFileSelect: (item: ImageItem) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;

        onFileSelect({ dataUrl, mime_type: file.type });
        if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-5 w-5" />
      </button>
    </>
  );
}

function SettingsButton({
  mcpConfigs = [],
  selectedMcpId,
  isMcpLoading = false,
  onMcpSelect,
  onMcpRefresh,
}: {
  mcpConfigs?: MCPConfig[];
  selectedMcpId?: string | null;
  isMcpLoading?: boolean;
  onMcpSelect?: (id: string | null) => void;
  onMcpRefresh?: () => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              setIsDialogOpen(true);
            }}
          >
            <Cpu className="mr-2 h-4 w-4" />
            <span>MCP Servers Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-muted-foreground cursor-not-allowed">
            More settings coming soon...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>MCP Servers Configuration</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <MCPConfigPanel
              configs={mcpConfigs}
              selectedId={selectedMcpId ?? null}
              isLoading={isMcpLoading}
              onSelect={(id) => {
                onMcpSelect?.(id);
                setIsDialogOpen(false);
              }}
              onRefresh={onMcpRefresh || (() => {})}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModelSelector({
  selectedModel,
  onModelChange,
}: {
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}) {
  const models = [
    { id: "qwen-plus", name: "Qwen 3", icon: "Q" },
    { id: "claud-sonnet-4-20250514", name: "Claude 4.5", icon: "C" },
    { id: "gemini-3-pro-preview", name: "Gemini 3 pro", icon: "G" },
  ];

  const currentModel = models.find((m) => m.id === selectedModel) || models[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center gap-1 px-2 py-1.5 ml-1 rounded-lg hover:bg-accent cursor-pointer transition-colors group">
          <span className="flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold text-muted-foreground">
            {currentModel.icon}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {currentModel.name}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            className="cursor-pointer"
            onSelect={() => onModelChange?.(model.id)}
          >
            <span className="flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold text-muted-foreground mr-2">
              {model.icon}
            </span>
            <span>{model.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const InputBar = forwardRef<HTMLTextAreaElement, InputBarProps>(
  function InputBar(
    {
      value,
      onChange,
      onSubmit,
      onStop,
      isLoading,
      placeholder,
      images = [],
      onImagesChange,
      mcpConfigs,
      selectedMcpId,
      isMcpLoading,
      onMcpSelect,
      onMcpRefresh,
      selectedModel,
      onModelChange,
    }: InputBarProps,
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const internalRef =
      (ref as React.RefObject<HTMLTextAreaElement>) || textareaRef;

    // 🔥 获取生成状态
    const isGenerating = useIsGenerating();
    const isDisabled = isLoading || isGenerating;

    useEffect(() => {
      if (internalRef.current) {
        internalRef.current.style.height = "inherit";
        const scrollHeight = internalRef.current.scrollHeight;
        internalRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
      }
    }, [value, internalRef]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !isDisabled &&
        (value.trim() || images.length > 0)
      ) {
        e.preventDefault();
        onSubmit();
      }
    };

    const handleFileSelect = (item: ImageItem) => {
      if (onImagesChange) {
        onImagesChange([...(images || []), item]);
      }
    };

    const removeImage = (index: number) => {
      if (onImagesChange) {
        onImagesChange(images.filter((_, i) => i !== index));
      }
    };

    return (
      <div className="p-4 bg-background">
        <div className="relative flex flex-col w-full max-w-4xl mx-auto border rounded-2xl bg-card shadow-sm transition-all focus-within:shadow-md focus-within:border-ring">
          {/* 图片预览区域 */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-4">
              {images.map((img, index) => (
                <div key={index} className="relative group w-16 h-16">
                  <Image
                    src={img.dataUrl}
                    alt={`upload-${index}`}
                    fill
                    className="object-cover rounded-lg border cursor-pointer hover:opacity-90"
                    onClick={() => window.open(img.dataUrl, "_blank")}
                    unoptimized={img.dataUrl.startsWith("data:")}
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-1.5 -right-1.5 bg-muted-foreground text-background rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 输入框区域 */}
          <div className="px-4 pt-4 pb-2">
            <textarea
              ref={internalRef}
              rows={1}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || "Ask a follow-up..."}
              disabled={isDisabled}
              className="w-full bg-transparent border-none outline-none text-foreground placeholder-muted-foreground text-sm py-1 resize-none min-h-6 max-h-50 overflow-y-auto"
            />
          </div>

          {/* 底部工具栏 */}
          <div className="flex items-center justify-between px-3 py-3 mt-1">
            <div className="flex items-center gap-1">
              <FileUploadButton onFileSelect={handleFileSelect} />
              <SettingsButton
                mcpConfigs={mcpConfigs}
                selectedMcpId={selectedMcpId}
                isMcpLoading={isMcpLoading}
                onMcpSelect={onMcpSelect}
                onMcpRefresh={onMcpRefresh}
              />
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={onModelChange}
              />
            </div>

            <button
              onClick={isLoading && onStop ? onStop : onSubmit}
              disabled={
                !isLoading &&
                ((!value.trim() && images.length === 0) || isDisabled)
              }
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                isLoading
                  ? "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                  : (!value.trim() && images.length === 0) || isDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-muted text-foreground hover:bg-accent"
              }`}
              title={isLoading ? "停止生成" : "发送"}
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 bg-red-600 rounded-sm" />
              ) : (
                <ArrowUp className="h-5 w-5 stroke-[2.5px]" />
              )}
              <span className="sr-only">{isLoading ? "Stop" : "Send"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
