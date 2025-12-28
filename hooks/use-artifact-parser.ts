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

/**
 * Artifact 解析缓冲器
 * 解决流式传输时 chunk 拆分导致的解析问题
 */
class ArtifactParserBuffer {
  private buffer = "";
  private cachedResult: ArtifactData | null = null;

  /**
   * 添加新的 chunk 并返回解析结果
   */
  parse(newContent: string): ArtifactData | null {
    // 如果内容没变，返回缓存结果
    if (newContent === this.buffer) {
      return this.cachedResult;
    }

    // 更新缓冲区
    this.buffer = newContent;

    // 基本检查
    if (!this.buffer.includes("<boltArtifact")) {
      return null;
    }

    // 执行解析
    this.cachedResult = this.parseArtifact(this.buffer);
    return this.cachedResult;
  }

  /**
   * 解析 Artifact（优化版：更宽容的正则匹配）
   */
  private parseArtifact(content: string): ArtifactData | null {
    // 提取 id 和 title（也支持未闭合的标签）
    let id = "";
    let title = "";

    // 尝试完整匹配
    const fullMatch = content.match(
      /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>/
    );
    if (fullMatch) {
      id = fullMatch[1];
      title = fullMatch[2];
    } else {
      // 容错：分别提取 id 和 title
      const idMatch = content.match(/<boltArtifact[^>]*id="([^"]*)"/);
      const titleMatch = content.match(/title="([^"]*)"/);
      if (idMatch) id = idMatch[1];
      if (titleMatch) title = titleMatch[1];
    }

    if (!id && !title) {
      return null; // 连基本信息都没有
    }

    // 提取所有文件
    const files = this.extractFiles(content);

    return { id, title, files };
  }

  /**
   * 提取文件列表（三阶段解析）
   */
  private extractFiles(content: string): ParsedFile[] {
    const files: ParsedFile[] = [];
    const processedPaths = new Set<string>();

    // 阶段 1: 完整闭合的文件（最高优先级）
    this.extractClosedFiles(content, files, processedPaths);

    // 阶段 2: 标签完整但内容未完成的文件
    this.extractPartialFiles(content, files, processedPaths);

    // 阶段 3: 标签本身还在生成的文件（最宽容的匹配）
    this.extractIncompleteFiles(content, files, processedPaths);

    return files;
  }

  /**
   * 阶段 1: 提取完整闭合的文件
   */
  private extractClosedFiles(
    content: string,
    files: ParsedFile[],
    processedPaths: Set<string>
  ): void {
    const regex =
      /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const filePath = match[1];
      if (processedPaths.has(filePath)) continue;

      const cleanContent = this.cleanCodeBlock(match[2]);
      files.push({
        path: filePath,
        content: cleanContent,
        language: this.getLanguageFromPath(filePath),
      });
      processedPaths.add(filePath);
    }
  }

  /**
   * 阶段 2: 提取标签完整但内容未完成的文件
   */
  private extractPartialFiles(
    content: string,
    files: ParsedFile[],
    processedPaths: Set<string>
  ): void {
    const regex = /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const filePath = match[1];
      if (processedPaths.has(filePath)) continue;

      const startIndex = match.index! + match[0].length;
      const endIndex = content.indexOf("</boltAction>", startIndex);

      const fileContent =
        endIndex !== -1
          ? content.substring(startIndex, endIndex)
          : content.substring(startIndex);

      const cleanContent = this.cleanCodeBlock(fileContent);
      if (cleanContent) {
        files.push({
          path: filePath,
          content: cleanContent,
          language: this.getLanguageFromPath(filePath),
        });
        processedPaths.add(filePath);
      }
    }
  }

  /**
   * 阶段 3: 提取标签不完整的文件（最宽容的匹配）
   */
  private extractIncompleteFiles(
    content: string,
    files: ParsedFile[],
    processedPaths: Set<string>
  ): void {
    // 匹配：<boltAction 开头，包含 type="file" 和 filePath="xxx"
    // 不要求引号闭合、不要求标签闭合
    const patterns = [
      // 完整的 filePath
      /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"/g,
      // filePath 的引号未闭合（只有开始引号）
      /<boltAction[^>]*type="file"[^>]*filePath="([^">]+)/g,
    ];

    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const filePath = match[1];
        if (processedPaths.has(filePath)) continue;

        // 查找标签是否闭合
        const tagStart = match.index!;
        const tagEnd = content.indexOf(">", tagStart);

        if (tagEnd === -1) {
          // 标签未闭合，添加占位符
          files.push({
            path: filePath,
            content: "",
            language: this.getLanguageFromPath(filePath),
          });
        } else {
          // 标签已闭合，提取内容
          const contentStart = tagEnd + 1;
          const contentEnd = content.indexOf("</boltAction>", contentStart);

          const fileContent =
            contentEnd !== -1
              ? content.substring(contentStart, contentEnd)
              : content.substring(contentStart);

          files.push({
            path: filePath,
            content: this.cleanCodeBlock(fileContent),
            language: this.getLanguageFromPath(filePath),
          });
        }
        processedPaths.add(filePath);
      }
    }
  }

  /**
   * 清理代码块（移除 ```language 标记）
   */
  private cleanCodeBlock(content: string): string {
    return content
      .trim()
      .replace(/^```[\w]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }

  /**
   * 根据文件路径获取语言类型
   */
  private getLanguageFromPath(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      css: "css",
      scss: "scss",
      html: "html",
      json: "json",
    };
    return languageMap[ext || ""] || "text";
  }

  /**
   * 重置缓冲区
   */
  reset(): void {
    this.buffer = "";
    this.cachedResult = null;
  }
}

// 全局缓冲器实例（可以优化为每个 hook 实例一个）
const parserBuffer = new ArtifactParserBuffer();

export function useArtifactParser(rawContent: string) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // 使用缓冲器解析 artifact 数据
  const artifact = useMemo(() => {
    if (!rawContent) {
      return null;
    }
    return parserBuffer.parse(rawContent);
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
