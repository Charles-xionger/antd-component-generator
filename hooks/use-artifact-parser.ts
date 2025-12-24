// hooks/use-artifact-parser.ts
import { useState, useMemo, useCallback } from "react";

export interface ParsedFile {
  path: string;
  content: string;
  language: string; // 文件语言类型，用于语法高亮
}

export interface ArtifactData {
  id: string;
  title: string;
  files: ParsedFile[];
}

export function useArtifactParser(rawContent: string) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // 解析 artifact 数据
  const artifact = useMemo(() => {
    if (!rawContent) {
      return null;
    }
    return parseArtifact(rawContent);
  }, [rawContent]);

  // 派生选中的文件
  const selectedFile = useMemo(() => {
    if (!artifact || !artifact.files.length) {
      return null;
    }

    // 如果没有选中路径，或者选中的路径不存在，默认选择第一个文件
    if (
      !selectedFilePath ||
      !artifact.files.find((f) => f.path === selectedFilePath)
    ) {
      return artifact.files[0];
    }

    return (
      artifact.files.find((f) => f.path === selectedFilePath) ||
      artifact.files[0]
    );
  }, [artifact, selectedFilePath]);

  const selectFile = useCallback((file: ParsedFile) => {
    setSelectedFilePath(file.path);
  }, []);

  return {
    artifact,
    selectedFile,
    selectFile,
  };
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "js":
      return "javascript";
    case "jsx":
      return "jsx";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "html":
      return "html";
    case "json":
      return "json";
    default:
      return "text";
  }
}

function parseArtifact(content: string): ArtifactData | null {
  if (!content.includes("<boltArtifact")) {
    return null;
  }

  // 提取 artifact 的 id 和 title
  const artifactMatch = content.match(
    /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>/
  );
  if (!artifactMatch) {
    return null;
  }

  const id = artifactMatch[1];
  const title = artifactMatch[2];

  // 提取所有文件 - 支持流式解析
  const files: ParsedFile[] = [];
  const processedPaths = new Set<string>();

  // 1. 先处理完整闭合的文件
  const closedActionRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

  let match;
  while ((match = closedActionRegex.exec(content)) !== null) {
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
        language: getLanguageFromPath(filePath),
      });
      processedPaths.add(filePath);
    }
  }

  // 2. 处理正在生成中的文件（包括部分标签）
  // 查找所有开始标签，包括可能正在生成的
  const allActionStarts = [
    ...content.matchAll(
      /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>/g
    ),
  ];

  for (const startMatch of allActionStarts) {
    const filePath = startMatch[1];
    const startIndex = startMatch.index! + startMatch[0].length;

    // 如果这个文件已经处理过（完整版本），跳过
    if (processedPaths.has(filePath)) {
      continue;
    }

    // 查找对应的结束标签
    const endTagIndex = content.indexOf("</boltAction>", startIndex);

    let fileContent: string;
    if (endTagIndex !== -1) {
      // 有结束标签，提取完整内容
      fileContent = content.substring(startIndex, endTagIndex);
    } else {
      // 没有结束标签，提取到当前内容末尾
      fileContent = content.substring(startIndex);
    }

    const cleanContent = fileContent
      .replace(/^```[\w]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    if (cleanContent) {
      files.push({
        path: filePath,
        content: cleanContent,
        language: getLanguageFromPath(filePath),
      });
      processedPaths.add(filePath);
    }
  }

  return {
    id,
    title,
    files,
  };
}
