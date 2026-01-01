// components/canvas/code-panel.tsx
"use client";

import { FileIcon } from "./file-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check } from "lucide-react";
import type { Artifact, ArtifactVersion, ParsedFile } from "./types";

interface CodePanelProps {
  isVisible: boolean;
  artifact: Artifact | null;
  selectedFile: ParsedFile | null;
  versions: ArtifactVersion[];
  selectedVersion: number | null;
  isLoadingVersions: boolean;
  copiedFile: string | null;
  onSelectFile: (file: ParsedFile) => void;
  onSelectVersion: (versionNumber: number) => void;
  onCopyToClipboard: (content: string, fileName: string) => void;
}

export function CodePanel({
  isVisible,
  artifact,
  selectedFile,
  versions,
  selectedVersion,
  isLoadingVersions,
  copiedFile,
  onSelectFile,
  onSelectVersion,
  onCopyToClipboard,
}: CodePanelProps) {
  return (
    <div
      className={`absolute inset-0 flex overflow-hidden transition-opacity duration-200 ${
        isVisible ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
      }`}
    >
      {/* File Explorer Sidebar */}
      <div className="w-56 bg-muted border-r flex flex-col">
        <div className="px-3 py-2 text-xs font-medium border-b flex items-center justify-between">
          <span>File explorer</span>
          {versions.length > 0 && (
            <Select
              value={selectedVersion?.toString() || ""}
              onValueChange={(value) => onSelectVersion(Number(value))}
              disabled={isLoadingVersions}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem
                    key={version.id}
                    value={version.versionNumber.toString()}
                  >
                    v{version.versionNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {artifact && artifact.files.length > 0 ? (
            artifact.files.map((file) => {
              const fileName = file.path.split("/").pop() || file.path;
              const isSelected = selectedFile?.path === file.path;

              return (
                <button
                  key={file.path}
                  onClick={() => onSelectFile(file)}
                  className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors relative ${
                    isSelected
                      ? file.isGenerating
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : "bg-accent text-accent-foreground"
                      : file.isGenerating
                      ? "text-primary hover:bg-accent"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <FileIcon language={file.language} />
                  <span className="truncate font-mono text-xs flex-1">
                    {fileName}
                  </span>
                  {/* 生成状态指示器 */}
                  {file.isGenerating && (
                    <Badge variant="outline" className="h-5 text-[10px]">
                      <span className="animate-pulse text-primary mr-1">●</span>
                      生成中
                    </Badge>
                  )}
                  {file.isComplete && !file.isGenerating && (
                    <span className="text-green-500 text-xs font-bold">✓</span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              暂无文件
            </div>
          )}
        </div>
      </div>

      {/* Code Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {selectedFile ? (
          <>
            {/* File Tab */}
            <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <FileIcon language={selectedFile.language} />
                <span className="font-mono">
                  {selectedFile.path.split("/").pop()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onCopyToClipboard(selectedFile.content, selectedFile.path)
                }
                title="复制代码"
              >
                {copiedFile === selectedFile.path ? (
                  <>
                    <Check className="h-3 w-3 mr-1 text-green-500" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    复制
                  </>
                )}
              </Button>
            </div>
            {/* Code Content */}
            <div className="flex-1 overflow-auto bg-background">
              <pre className="p-4 text-sm whitespace-pre font-mono leading-relaxed">
                <code>{selectedFile.content}</code>
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="text-4xl mb-2">📁</div>
              <div className="text-sm">选择一个文件来查看代码</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
