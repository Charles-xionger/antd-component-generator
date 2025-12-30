// hooks/use-canvas.ts
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useArtifactParser } from "./use-artifact-parser";
import type {
  ArtifactVersion,
  ParsedFile,
  DeviceType,
} from "@/components/canvas";

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
  selectVersion: (versionNumber: number, allowSandboxUpdate?: boolean) => void;
  fetchVersionHistory: () => Promise<void>;
  /** 刷新版本列表（不切换内容，用于保存后刷新） */
  refreshVersionList: () => Promise<void>;
  /** 创建乐观更新版本，展示代码生成过程 */
  createOptimisticVersion: () => void;

  // UI 状态
  activeTab: "preview" | "code";
  setActiveTab: (tab: "preview" | "code") => void;
  selectedDevice: DeviceType;
  setSelectedDevice: (device: DeviceType) => void;

  // 代码更新
  setGeneratedCode: (code: string) => void;
  /** 合并新代码和现有代码（保留未修改的文件） */
  mergeAndSetGeneratedCode: (newCode: string) => void;
  generatedCode: string;

  // Sandbox 通信
  sendFilesToSandbox: (
    iframeRef: React.RefObject<HTMLIFrameElement | null>
  ) => void;
  /** 控制是否应该发送文件到沙箱（只有审查通过后才发送） */
  shouldSendToSandbox: boolean;
  setShouldSendToSandbox: (should: boolean) => void;

  // 复制功能
  copiedFile: string | null;
  copyToClipboard: (content: string, fileName: string) => Promise<void>;
}

// 版本缓存 - 存储每个 threadId 的版本数据，避免重复请求
const versionCache = new Map<string, Map<number, ArtifactVersion>>();

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

  // 当前版本的文件缓存（用于合并）
  const currentVersionFilesRef = useRef<Map<string, string>>(new Map());

  // UI 状态
  const [activeTab, setActiveTab] = useState<"preview" | "code">("code");
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>("desktop");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // 沙箱控制状态
  const [shouldSendToSandbox, setShouldSendToSandbox] = useState(false);

  // 使用 artifact parser
  const { artifact, selectedFile, selectFile } =
    useArtifactParser(generatedCode);

  // 展开/收起（保留接口但不再使用）
  const expand = useCallback(() => {
    // 固定布局模式下不需要展开逻辑
    // 展开时如果有 artifact 则允许渲染
    if (artifact && artifact.files.length > 0) {
      setShouldSendToSandbox(true);
      console.log("[expand] 允许渲染");
    }
  }, [artifact]);
  const collapse = useCallback(() => {}, []);
  const toggle = useCallback(() => {}, []);

  // 获取当前 thread 的版本缓存
  const getThreadCache = useCallback(() => {
    if (!threadId) return new Map<number, ArtifactVersion>();
    if (!versionCache.has(threadId)) {
      versionCache.set(threadId, new Map());
    }
    return versionCache.get(threadId)!;
  }, [threadId]);

  // 缓存版本数据
  const cacheVersion = useCallback(
    (version: ArtifactVersion) => {
      const cache = getThreadCache();
      cache.set(version.versionNumber, version);
    },
    [getThreadCache]
  );

  // 从缓存获取版本
  const getCachedVersion = useCallback(
    (versionNumber: number): ArtifactVersion | undefined => {
      const cache = getThreadCache();
      return cache.get(versionNumber);
    },
    [getThreadCache]
  );

  // 获取版本历史（完整刷新，包括切换到最新版本）
  const fetchVersionHistory = useCallback(async () => {
    if (!threadId) return;

    console.log("[fetchVersionHistory] 开始获取版本历史, threadId:", threadId);
    setIsLoadingVersions(true);
    try {
      const response = await fetch(`/api/agent/history/${threadId}`);
      if (response.ok) {
        const data = await response.json();
        console.log("[fetchVersionHistory] API 响应:", {
          hasArtifact: !!data.artifact,
          versionsCount: data.artifact?.versions?.length || 0,
        });
        if (data.artifact && data.artifact.versions) {
          const fetchedVersions = data.artifact.versions as ArtifactVersion[];
          setVersions(fetchedVersions);

          // 缓存所有版本
          fetchedVersions.forEach((version) => {
            cacheVersion(version);
          });

          if (fetchedVersions.length > 0) {
            const latestVersion = fetchedVersions[0];
            setSelectedVersion(latestVersion.versionNumber);

            // 更新文件缓存
            const filesMap = new Map<string, string>();
            latestVersion.files.forEach((file) => {
              filesMap.set(file.path, file.content);
            });
            currentVersionFilesRef.current = filesMap;

            console.log(
              "[fetchVersionHistory] 已缓存最新版本文件:",
              latestVersion.versionNumber,
              `文件数: ${filesMap.size}`,
              `文件: ${Array.from(filesMap.keys()).join(", ")}`
            );

            const filesXml = latestVersion.files
              .map(
                (file) =>
                  `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
              )
              .join("\n");
            const versionXml = `<boltArtifact id="version-${latestVersion.versionNumber}" title="Version ${latestVersion.versionNumber}">\n${filesXml}\n</boltArtifact>`;
            setGeneratedCode(versionXml);

            // 加载历史版本时允许渲染
            setShouldSendToSandbox(true);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch version history:", error);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [threadId, cacheVersion]);

  // 刷新版本列表（只更新列表和缓存，不切换内容，用于保存后刷新）
  const refreshVersionList = useCallback(async () => {
    if (!threadId) return;

    console.log("[refreshVersionList] 刷新版本列表, threadId:", threadId);
    try {
      const response = await fetch(`/api/agent/history/${threadId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.artifact && data.artifact.versions) {
          const fetchedVersions = data.artifact.versions as ArtifactVersion[];
          setVersions(fetchedVersions);

          // 缓存所有版本
          fetchedVersions.forEach((version) => {
            cacheVersion(version);
          });

          // 更新选中版本为最新版本号并切换内容
          if (fetchedVersions.length > 0) {
            const latestVersion = fetchedVersions[0];
            setSelectedVersion(latestVersion.versionNumber);

            // 更新文件缓存为最新版本的文件
            const filesMap = new Map<string, string>();
            latestVersion.files.forEach((file) => {
              filesMap.set(file.path, file.content);
            });
            currentVersionFilesRef.current = filesMap;

            // 更新显示的代码内容为最新版本
            const filesXml = latestVersion.files
              .map(
                (file) =>
                  `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
              )
              .join("\n");
            const versionXml = `<boltArtifact id="version-${latestVersion.versionNumber}" title="Version ${latestVersion.versionNumber}">\n${filesXml}\n</boltArtifact>`;
            setGeneratedCode(versionXml);

            console.log(
              "[refreshVersionList] 版本列表已更新，切换到最新版本:",
              latestVersion.versionNumber,
              `文件数: ${filesMap.size}`
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to refresh version list:", error);
    }
  }, [threadId, cacheVersion]);

  // 版本选择 - 使用缓存快速切换
  const selectVersion = useCallback(
    (versionNumber: number, allowSandboxUpdate: boolean = true) => {
      // 先尝试从缓存获取
      const cachedVersion = getCachedVersion(versionNumber);
      if (cachedVersion) {
        setSelectedVersion(versionNumber);

        // 更新文件缓存
        const filesMap = new Map<string, string>();
        cachedVersion.files.forEach((file) => {
          filesMap.set(file.path, file.content);
        });
        currentVersionFilesRef.current = filesMap;

        const filesXml = cachedVersion.files
          .map(
            (file) =>
              `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
          )
          .join("\n");
        const versionXml = `<boltArtifact id="version-${versionNumber}" title="Version ${versionNumber}">\n${filesXml}\n</boltArtifact>`;
        setGeneratedCode(versionXml);

        // 根据参数决定是否允许渲染
        setShouldSendToSandbox(allowSandboxUpdate);

        console.log(
          "从缓存加载版本:",
          versionNumber,
          allowSandboxUpdate ? "，允许渲染" : "，暂不渲染"
        );
        return;
      }

      // 如果没有缓存，从 versions 数组查找
      const version = versions.find((v) => v.versionNumber === versionNumber);
      if (version) {
        setSelectedVersion(versionNumber);
        cacheVersion(version); // 缓存版本

        // 更新文件缓存
        const filesMap = new Map<string, string>();
        version.files.forEach((file) => {
          filesMap.set(file.path, file.content);
        });
        currentVersionFilesRef.current = filesMap;

        const filesXml = version.files
          .map(
            (file) =>
              `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
          )
          .join("\n");
        const versionXml = `<boltArtifact id="version-${versionNumber}" title="Version ${versionNumber}">\n${filesXml}\n</boltArtifact>`;
        setGeneratedCode(versionXml);

        // 根据参数决定是否允许渲染
        setShouldSendToSandbox(allowSandboxUpdate);

        console.log(
          "加载版本:",
          versionNumber,
          allowSandboxUpdate ? "，允许渲染" : "，暂不渲染"
        );
      }
    },
    [versions, getCachedVersion, cacheVersion]
  );

  // 创建乐观更新版本，用于代码生成过程的展示
  const createOptimisticVersion = useCallback(() => {
    // 计算下一个版本号
    const nextVersionNumber =
      versions.length > 0
        ? Math.max(...versions.map((v) => v.versionNumber)) + 1
        : 1;

    // 设置为新版本，但不允许沙箱渲染
    setSelectedVersion(nextVersionNumber);
    setShouldSendToSandbox(false);

    console.log("创建乐观版本:", nextVersionNumber, "，展示代码生成但暂不渲染");
  }, [versions]);

  // threadId 变化时获取版本
  useEffect(() => {
    if (threadId) {
      fetchVersionHistory();
    } else {
      setVersions([]);
      setSelectedVersion(null);
      currentVersionFilesRef.current = new Map();
    }
  }, [threadId, fetchVersionHistory]);

  // 更新当前版本的文件缓存（当 artifact 变化时）
  useEffect(() => {
    if (artifact && artifact.files.length > 0) {
      const filesMap = new Map<string, string>();
      artifact.files.forEach((file) => {
        filesMap.set(file.path, file.content);
      });
      currentVersionFilesRef.current = filesMap;
    }
  }, [artifact]);

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

  // 向 Sandbox 发送文件
  const sendFilesToSandbox = useCallback(
    (iframeRef: React.RefObject<HTMLIFrameElement | null>) => {
      if (!artifact || !artifact.files || artifact.files.length === 0) {
        console.log("No files to send to sandbox");
        return;
      }

      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        console.log("Iframe not ready");
        return;
      }

      // 将文件转换为 sandbox 需要的格式（使用文件名作为 key）
      const files: Record<string, string> = {};
      artifact.files.forEach((file) => {
        const fileName = file.path.split("/").pop() || file.path;
        files[fileName] = file.content;
      });

      // 查找入口文件
      const entryFileName = (() => {
        const appFile = artifact.files.find((f) => f.path.includes("App.tsx"));
        if (appFile) return appFile.path.split("/").pop() || "App.tsx";

        const componentFile = artifact.files.find(
          (f) =>
            f.path.endsWith(".tsx") && !f.path.toLowerCase().includes("use")
        );
        if (componentFile)
          return componentFile.path.split("/").pop() || "App.tsx";

        const tsxFile = artifact.files.find((f) => f.path.endsWith(".tsx"));
        if (tsxFile) return tsxFile.path.split("/").pop() || "App.tsx";

        return "App.tsx";
      })();

      // 发送文件到 sandbox（与 use-canvas-chat.ts 格式一致）
      iframe.contentWindow.postMessage(
        {
          type: "artifacts",
          payload: { files, entryFile: entryFileName },
        },
        "http://localhost:5174/sandbox.html"
      );

      console.log(
        "Files sent to sandbox:",
        Object.keys(files),
        "Entry:",
        entryFileName
      );
    },
    [artifact]
  );

  // 合并新代码和现有代码（保留未修改的文件）- 使用 currentVersionFilesRef 避免依赖循环
  const mergeAndSetGeneratedCode = useCallback((newCode: string) => {
    console.log("[mergeAndSetGeneratedCode] 开始合并新代码");
    if (!newCode.includes("<boltArtifact")) {
      setGeneratedCode(newCode);
      return;
    }

    // 解析新代码中的文件
    const newFiles = parseFilesFromCode(newCode);

    if (newFiles.length === 0) {
      setGeneratedCode(newCode);
      return;
    }

    console.log(
      "[mergeAndSetGeneratedCode] 开始合并:",
      `缓存文件数: ${currentVersionFilesRef.current.size}`,
      `新文件数: ${newFiles.length}`,
      `新文件: ${newFiles.map((f) => f.path).join(", ")}`
    );

    // 如果当前没有缓存的文件，直接使用新代码
    if (currentVersionFilesRef.current.size === 0) {
      console.log("[mergeAndSetGeneratedCode] 缓存为空，直接使用新代码");
      setGeneratedCode(newCode);
      // 更新缓存
      newFiles.forEach((file) => {
        currentVersionFilesRef.current.set(file.path, file.content);
      });
      return;
    }

    // 直接合并文件，保留未修改的文件
    const mergedFilesMap = new Map<string, string>();

    // 先添加所有旧文件（从缓存）
    currentVersionFilesRef.current.forEach((content, path) => {
      mergedFilesMap.set(path, content);
    });

    // 用新文件覆盖
    newFiles.forEach((file) => {
      mergedFilesMap.set(file.path, file.content);
    });

    // 提取新代码的 id 和 title
    const artifactMatch = newCode.match(
      /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>/
    );
    const id = artifactMatch?.[1] || "merged";
    const title = artifactMatch?.[2] || "新版本";

    // 重建合并后的代码
    const mergedFiles = Array.from(mergedFilesMap.entries()).map(
      ([path, content]) => ({ path, content })
    );
    const mergedCode = reconstructCodeFromFilesWithMeta(mergedFiles, id, title);

    console.log(
      "[mergeAndSetGeneratedCode] 合并完成:",
      `旧文件 ${currentVersionFilesRef.current.size} 个`,
      `新文件 ${newFiles.length} 个`,
      `合并后 ${mergedFilesMap.size} 个`
    );

    // 更新缓存
    currentVersionFilesRef.current = mergedFilesMap;

    setGeneratedCode(mergedCode);
  }, []);

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
    fetchVersionHistory,
    refreshVersionList,
    createOptimisticVersion,

    // UI 状态
    activeTab,
    setActiveTab,
    selectedDevice,
    setSelectedDevice,

    // 代码更新
    setGeneratedCode,
    mergeAndSetGeneratedCode,
    generatedCode,

    // Sandbox 通信
    sendFilesToSandbox,
    shouldSendToSandbox,
    setShouldSendToSandbox,

    // 复制功能
    copiedFile,
    copyToClipboard,
  };
}

// 从文件列表重建代码内容（带自定义 id 和 title）
function reconstructCodeFromFilesWithMeta(
  files: Array<{ path: string; content: string }>,
  id: string,
  title: string
): string {
  if (!files || files.length === 0) return "";

  let code = `<boltArtifact id="${id}" title="${title}">\n`;
  for (const file of files) {
    code += `<boltAction type="file" filePath="${file.path}">\n`;
    code += file.content;
    code += "\n</boltAction>\n";
  }
  code += "</boltArtifact>";

  return code;
}

// 从代码中解析文件列表
function parseFilesFromCode(
  code: string
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const processedPaths = new Set<string>();

  // 匹配完整闭合的文件
  const closedActionRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

  let match;
  while ((match = closedActionRegex.exec(code)) !== null) {
    const filePath = match[1];
    const fileContent = match[2].trim();

    if (!processedPaths.has(filePath)) {
      const cleanContent = fileContent
        .replace(/^```[\w]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      files.push({
        path: filePath,
        content: cleanContent,
      });
      processedPaths.add(filePath);
    }
  }

  return files;
}
