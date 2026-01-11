// hooks/use-artifact-parser.ts
import { useState, useMemo, useCallback, useEffect } from "react";

export interface ParsedFile {
  path: string;
  content: string;
  language: string; // 文件语言类型，用于语法高亮
  isComplete: boolean; // 文件是否完全生成
  isGenerating: boolean; // 文件是否正在生成
}

export interface ArtifactData {
  id: string;
  title: string;
  version?: number; // 版本号（从 <boltArtifact version="N"> 中提取）
  files: ParsedFile[];
  currentGeneratingFile: string | null; // 当前正在生成的文件路径
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
    let version: number | undefined;

    // 尝试完整匹配（包含 version）
    const fullMatch = content.match(
      /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*(?:version="(\d+)")?[^>]*>/
    );
    if (fullMatch) {
      id = fullMatch[1];
      title = fullMatch[2];
      version = fullMatch[3] ? parseInt(fullMatch[3], 10) : undefined;
    } else {
      // 容错：分别提取 id、title 和 version
      const idMatch = content.match(/<boltArtifact[^>]*id="([^"]*)"/);
      const titleMatch = content.match(/title="([^"]*)"/);
      const versionMatch = content.match(/version="(\d+)"/);
      if (idMatch) id = idMatch[1];
      if (titleMatch) title = titleMatch[1];
      if (versionMatch) version = parseInt(versionMatch[1], 10);
    }

    if (!id && !title) {
      return null; // 连基本信息都没有
    }

    // 提取所有文件（增强版：跟踪生成状态）
    const { files, currentGeneratingFile } =
      this.extractFilesWithState(content);

    return { id, title, version, files, currentGeneratingFile };
  }

  /**
   * 提取文件列表（增强版：跟踪生成状态）
   */
  private extractFilesWithState(content: string): {
    files: ParsedFile[];
    currentGeneratingFile: string | null;
  } {
    const files: ParsedFile[] = [];
    const processedPaths = new Set<string>();
    let currentGeneratingFile: string | null = null;

    console.log("[Parser] 开始解析文件，内容长度:", content.length);

    // 阶段 1: 完整闭合的文件（已完成）
    this.extractClosedFilesWithState(content, files, processedPaths);
    console.log(`[Parser] 阶段1完成，找到 ${files.length} 个完整文件`);

    // 阶段 2: 标签完整但内容未完成的文件（正在生成）
    const generatingFiles = this.extractPartialFilesWithState(
      content,
      files,
      processedPaths
    );
    console.log(
      `[Parser] 阶段2完成，总共 ${files.length} 个文件，其中 ${generatingFiles.length} 个正在生成`
    );

    if (generatingFiles.length > 0) {
      currentGeneratingFile = generatingFiles[generatingFiles.length - 1];
      console.log(`[Parser] 当前生成文件: ${currentGeneratingFile}`);
    }

    // 阶段 3: 标签本身还在生成的文件（等待中）
    this.extractIncompleteFilesWithState(content, files, processedPaths);
    console.log(`[Parser] 阶段3完成，最终文件数: ${files.length}`);

    // 打印最终文件列表
    console.log(
      "[Parser] 最终解析结果:",
      files.map((f) => ({
        path: f.path,
        contentLength: f.content.length,
        isComplete: f.isComplete,
        isGenerating: f.isGenerating,
      }))
    );

    return { files, currentGeneratingFile };
  }

  /**
   * 阶段 1: 提取完整闭合的文件（已完成）
   */
  private extractClosedFilesWithState(
    content: string,
    files: ParsedFile[],
    processedPaths: Set<string>
  ): void {
    // 使用非贪婪匹配，更准确地捕获每个完整的 boltAction
    const regex =
      /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const filePath = match[1];
      if (processedPaths.has(filePath)) {
        console.log(`[Parser] 跳过重复文件: ${filePath}`);
        continue;
      }

      const cleanContent = this.cleanCodeBlock(match[2]);
      console.log(
        `[Parser] 完整文件: ${filePath}, 内容长度: ${cleanContent.length}`
      );

      files.push({
        path: filePath,
        content: cleanContent,
        language: this.getLanguageFromPath(filePath),
        isComplete: true,
        isGenerating: false,
      });
      processedPaths.add(filePath);
    }
  }

  /**
   * 阶段 2: 提取标签完整但内容未完成的文件（正在生成）
   */
  private extractPartialFilesWithState(
    content: string,
    files: ParsedFile[],
    processedPaths: Set<string>
  ): string[] {
    const generatingFiles: string[] = [];
    const regex = /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const filePath = match[1];
      if (processedPaths.has(filePath)) {
        console.log(`[Parser] 跳过已处理文件: ${filePath}`);
        continue;
      }

      const startIndex = match.index! + match[0].length;
      const endIndex = content.indexOf("</boltAction>", startIndex);

      const fileContent =
        endIndex !== -1
          ? content.substring(startIndex, endIndex)
          : content.substring(startIndex);

      const cleanContent = this.cleanCodeBlock(fileContent);

      // 关键修复：无论内容是否为空，都要添加文件
      if (endIndex === -1) {
        // 没有结束标签，说明正在生成
        console.log(
          `[Parser] 正在生成文件: ${filePath}, 当前内容长度: ${cleanContent.length}`
        );
        files.push({
          path: filePath,
          content: cleanContent,
          language: this.getLanguageFromPath(filePath),
          isComplete: false,
          isGenerating: true,
        });
        processedPaths.add(filePath);
        generatingFiles.push(filePath);
      } else {
        // 有结束标签，说明已完成（即使内容为空也要添加）
        console.log(
          `[Parser] 已完成文件: ${filePath}, 内容长度: ${cleanContent.length}`
        );
        files.push({
          path: filePath,
          content: cleanContent,
          language: this.getLanguageFromPath(filePath),
          isComplete: true,
          isGenerating: false,
        });
        processedPaths.add(filePath);
      }
    }

    return generatingFiles;
  }

  /**
   * 阶段 3: 提取标签不完整的文件（等待中）
   */
  private extractIncompleteFilesWithState(
    content: string,
    files: ParsedFile[],
    processedPaths: Set<string>
  ): void {
    const patterns = [
      /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"/g,
      /<boltAction[^>]*type="file"[^>]*filePath="([^">]+)/g,
    ];

    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const filePath = match[1];
        if (processedPaths.has(filePath)) {
          console.log(`[Parser] 阶段3跳过已处理文件: ${filePath}`);
          continue;
        }

        const tagStart = match.index!;
        const tagEnd = content.indexOf(">", tagStart);

        if (tagEnd === -1) {
          // 标签还没闭合
          console.log(`[Parser] 标签未完成: ${filePath}`);
          files.push({
            path: filePath,
            content: "",
            language: this.getLanguageFromPath(filePath),
            isComplete: false,
            isGenerating: false, // 标签未完成，还未开始生成内容
          });
          processedPaths.add(filePath);
        } else {
          // 标签已闭合，提取内容
          const contentStart = tagEnd + 1;
          const contentEnd = content.indexOf("</boltAction>", contentStart);

          const fileContent =
            contentEnd !== -1
              ? content.substring(contentStart, contentEnd)
              : content.substring(contentStart);

          const cleanContent = this.cleanCodeBlock(fileContent);

          // 修复：无论内容是否为空都要添加
          console.log(
            `[Parser] 阶段3找到文件: ${filePath}, 内容长度: ${
              cleanContent.length
            }, 是否完成: ${contentEnd !== -1}`
          );
          files.push({
            path: filePath,
            content: cleanContent,
            language: this.getLanguageFromPath(filePath),
            isComplete: contentEnd !== -1,
            isGenerating: contentEnd === -1,
          });
          processedPaths.add(filePath);
        }
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
  const [lastGeneratingFile, setLastGeneratingFile] = useState<string | null>(
    null
  );

  // 使用缓冲器解析 artifact 数据
  const artifact = useMemo(() => {
    if (!rawContent) {
      return null;
    }
    const parsed = parserBuffer.parse(rawContent);
    if (parsed) {
      console.log("[useArtifactParser] 解析结果:", {
        filesCount: parsed.files.length,
        files: parsed.files.map((f) => ({
          path: f.path,
          isComplete: f.isComplete,
          isGenerating: f.isGenerating,
        })),
        currentGeneratingFile: parsed.currentGeneratingFile,
      });
    }
    return parsed;
  }, [rawContent]);

  // 自动切换到正在生成的文件
  useEffect(() => {
    if (!artifact || !artifact.currentGeneratingFile) {
      return;
    }

    // 如果检测到新的正在生成的文件，自动切换过去
    if (artifact.currentGeneratingFile !== lastGeneratingFile) {
      console.log(
        "[Artifact Parser] 检测到新文件生成:",
        artifact.currentGeneratingFile,
        "自动切换文件"
      );
      // 使用 setTimeout 避免在渲染过程中直接更新状态
      setTimeout(() => {
        setSelectedFilePath(artifact.currentGeneratingFile!);
        setLastGeneratingFile(artifact.currentGeneratingFile!);
      }, 0);
    }
  }, [artifact, lastGeneratingFile]);

  // 派生选中的文件
  const selectedFile = useMemo(() => {
    if (!artifact || !artifact.files.length) {
      return null;
    }

    // 优先选择用户手动选择的文件
    if (selectedFilePath) {
      const found = artifact.files.find((f) => f.path === selectedFilePath);
      if (found) {
        return found;
      }
    }

    // 如果用户没有选择，默认选择正在生成的文件
    if (artifact.currentGeneratingFile) {
      const generating = artifact.files.find(
        (f) => f.path === artifact.currentGeneratingFile
      );
      if (generating) {
        return generating;
      }
    }

    // 兜底：选择第一个文件
    return artifact.files[0];
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
