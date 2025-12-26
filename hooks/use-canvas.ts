// hooks/use-canvas.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { useArtifactParser } from "./use-artifact-parser";
import type {
  ArtifactVersion,
  ParsedFile,
  DeviceType,
} from "@/components/canvas/types";

export interface UseCanvasOptions {
  /** 当前 threadId */
  threadId?: string;
  /** 初始代码内容 */
  initialCode?: string;
}

export interface UseCanvasReturn {
  // 展开状态
  isExpanded: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;

  // Artifact 数据
  artifact: ReturnType<typeof useArtifactParser>["artifact"];
  selectedFile: ParsedFile | null;
  selectFile: (file: ParsedFile) => void;

  // 版本管理
  versions: ArtifactVersion[];
  selectedVersion: number | null;
  isLoadingVersions: boolean;
  selectVersion: (versionNumber: number) => void;

  // UI 状态
  activeTab: "preview" | "code";
  setActiveTab: (tab: "preview" | "code") => void;
  selectedDevice: DeviceType;
  setSelectedDevice: (device: DeviceType) => void;

  // 代码更新
  setGeneratedCode: (code: string) => void;
  generatedCode: string;

  // 复制功能
  copiedFile: string | null;
  copyToClipboard: (content: string, fileName: string) => Promise<void>;
}

export function useCanvas({
  threadId,
  initialCode = "",
}: UseCanvasOptions = {}): UseCanvasReturn {
  // 展开状态
  const [isExpanded, setIsExpanded] = useState(false);

  // 代码内容
  const [generatedCode, setGeneratedCode] = useState(initialCode);

  // 版本管理
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // UI 状态
  const [activeTab, setActiveTab] = useState<"preview" | "code">("code");
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>("desktop");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // 使用 artifact parser
  const { artifact, selectedFile, selectFile } =
    useArtifactParser(generatedCode);

  // 展开/收起
  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);
  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  // 版本选择
  const selectVersion = useCallback(
    async (versionNumber: number) => {
      if (!threadId) return;

      setSelectedVersion(versionNumber);
      setIsLoadingVersions(true);

      try {
        const response = await fetch(`/api/agent/history/${threadId}`);
        if (response.ok) {
          const data = await response.json();
          const version = data.versions?.find(
            (v: ArtifactVersion) => v.versionNumber === versionNumber
          );
          if (version?.files?.length > 0) {
            // 重建代码内容
            const reconstructedCode = reconstructCodeFromFiles(version.files);
            setGeneratedCode(reconstructedCode);
          }
        }
      } catch (error) {
        console.error("Failed to load version:", error);
      } finally {
        setIsLoadingVersions(false);
      }
    },
    [threadId]
  );

  // 获取版本列表
  useEffect(() => {
    const fetchVersions = async () => {
      if (!threadId) {
        setVersions([]);
        return;
      }

      try {
        const response = await fetch(`/api/agent/history/${threadId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.versions) {
            setVersions(data.versions);
            // 默认选择最新版本
            if (data.versions.length > 0 && selectedVersion === null) {
              setSelectedVersion(data.versions[0].versionNumber);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch versions:", error);
      }
    };

    fetchVersions();
  }, [threadId, selectedVersion]);

  // 复制到剪贴板
  const copyToClipboard = useCallback(
    async (content: string, fileName: string) => {
      try {
        await navigator.clipboard.writeText(content);
        setCopiedFile(fileName);
        setTimeout(() => setCopiedFile(null), 2000);
      } catch (err) {
        console.error("Failed to copy text:", err);
      }
    },
    []
  );

  // 更新代码时，如果有 artifact 则自动展开
  useEffect(() => {
    if (generatedCode && generatedCode.includes("<boltArtifact")) {
      // 可以选择自动展开，但按豆包风格，用户点击卡片才展开
      // setIsExpanded(true);
    }
  }, [generatedCode]);

  return {
    // 展开状态
    isExpanded,
    expand,
    collapse,
    toggle,

    // Artifact 数据
    artifact,
    selectedFile,
    selectFile,

    // 版本管理
    versions,
    selectedVersion,
    isLoadingVersions,
    selectVersion,

    // UI 状态
    activeTab,
    setActiveTab,
    selectedDevice,
    setSelectedDevice,

    // 代码更新
    setGeneratedCode,
    generatedCode,

    // 复制功能
    copiedFile,
    copyToClipboard,
  };
}

// 从文件列表重建代码内容（用于版本切换）
function reconstructCodeFromFiles(
  files: Array<{ path: string; content: string }>
): string {
  if (!files || files.length === 0) return "";

  // 重建 boltArtifact 格式
  let code = '<boltArtifact id="restored" title="Restored Version">\n';
  for (const file of files) {
    code += `<boltAction type="file" filePath="${file.path}">\n`;
    code += file.content;
    code += "\n</boltAction>\n";
  }
  code += "</boltArtifact>";

  return code;
}
