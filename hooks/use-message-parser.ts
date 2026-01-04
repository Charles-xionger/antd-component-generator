// hooks/use-message-parser.ts
import { useMemo } from "react";
import type { Artifact, ParsedFile } from "@/components/canvas";

// Architect 规划类型
export interface ArchitectPlan {
  mode: "create" | "modify";
  files?: Array<{ path: string; description: string }>;
  target_files?: string[];
  dependencies?: string[];
  architecture_notes?: string;
}

// 解析后的消息数据
export interface ParsedMessageData {
  artifact: Artifact | null;
  architectPlan: ArchitectPlan | null;
  isArchitectMessage: boolean;
  isCodingMessage: boolean;
  // 三段式内容 - 代码生成
  openingText: string | null; // 开场白
  closingText: string | null; // 结束语
  // 三段式内容 - 架构规划
  architectOpeningText: string | null; // architect 开场白
  architectClosingText: string | null; // architect 结束语
  architectPlanContent: string | null; // architect plan 标签内的内容（支持流式）
}

/**
 * 提取开场白（boltArtifact 之前的内容）
 * 支持流式：即使标签未出现，也提取当前所有内容作为开场白
 */
export function extractOpeningText(content: string): string | null {
  // 如果内容包含 <boltArtifact 标签，提取标签之前的内容
  if (content.includes("<boltArtifact")) {
    const match = content.match(/^([\s\S]*?)<boltArtifact/);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
    return null;
  }

  // 流式场景：如果还没有出现标签，但内容不为空，说明可能是开场白
  // 判断：如果内容不包含任何 XML 标签特征（包括不完整的标签），视为开场白
  const trimmed = content.trim();
  if (trimmed && !trimmed.includes("<")) {
    // 不包含任何 < 字符，说明肯定不是标签，是纯文本开场白
    return trimmed;
  }

  return null;
}

/**
 * 提取结束语（boltArtifact 之后的内容）
 * 只在标签完整闭合后提取
 */
export function extractClosingText(content: string): string | null {
  // 必须有完整的闭合标签才提取结束语
  if (!content.includes("</boltArtifact>")) {
    return null;
  }

  const match = content.match(/<\/boltArtifact>([\s\S]*?)$/);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return null;
}

/**
 * 提取 architectPlan 的开场白（标签之前的内容）
 */
export function extractArchitectOpeningText(content: string): string | null {
  if (!content.includes("<architectPlan")) {
    return null;
  }

  const match = content.match(/^([\s\S]*?)<architectPlan/);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return null;
}

/**
 * 提取 architectPlan 的结束语（标签之后的内容）
 */
export function extractArchitectClosingText(content: string): string | null {
  // 必须有完整的闭合标签才提取结束语
  if (!content.includes("</architectPlan>")) {
    return null;
  }

  const match = content.match(/<\/architectPlan>([\s\S]*?)$/);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return null;
}

/**
 * 提取 architectPlan 标签内的内容（支持流式：未闭合的标签）
 */
export function extractArchitectPlanContent(content: string): string | null {
  if (!content.includes("<architectPlan")) {
    return null;
  }

  // 先尝试匹配完整的标签
  const completeMatch = content.match(
    /<architectPlan>([\s\S]*?)<\/architectPlan>/
  );

  if (completeMatch) {
    return completeMatch[1].trim();
  }

  // 流式场景：匹配未闭合的标签
  const isStreaming = !content.includes("</architectPlan>");
  if (isStreaming) {
    const partialMatch = content.match(/<architectPlan>([\s\S]*?)$/);
    if (partialMatch) {
      return partialMatch[1].trim();
    }
  }

  return null;
}

/**
 * 从消息内容中解析 artifact（支持流式）
 */
export function parseArtifactFromContent(content: string): Artifact | null {
  if (!content.includes("<boltArtifact")) return null;

  let id = "unknown";
  let title = "Generated Code";

  const match1 = content.match(
    /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>/
  );
  const match2 = content.match(
    /<boltArtifact[^>]*title="([^"]*)"[^>]*id="([^"]*)"[^>]*>/
  );

  if (match1) {
    id = match1[1];
    title = match1[2];
  } else if (match2) {
    id = match2[2];
    title = match2[1];
  }

  const files: ParsedFile[] = [];

  // 尝试匹配完整的 boltAction 标签
  const completeFileRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    json: "json",
    html: "html",
  };

  let match;
  while ((match = completeFileRegex.exec(content)) !== null) {
    const filePath = match[1];
    const ext = filePath.split(".").pop() || "";
    files.push({
      path: filePath,
      content: match[2].trim(),
      language: languageMap[ext] || "text",
      isComplete: true,
      isGenerating: false,
    });
  }

  // 流式支持：尝试匹配未闭合的 boltAction 标签（无论是否已有完整文件）
  // 找到最后一个完整文件的结束位置
  const lastCompleteMatch = content.lastIndexOf("</boltAction>");
  const searchFrom = lastCompleteMatch !== -1 ? lastCompleteMatch + 14 : 0;
  const remainingContent = content.substring(searchFrom);

  const partialFileRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)$/;
  const partialMatch = remainingContent.match(partialFileRegex);

  if (partialMatch) {
    const filePath = partialMatch[1];
    const ext = filePath.split(".").pop() || "";
    const partialContent = partialMatch[2].trim();

    // 只有当有内容时才添加
    if (partialContent) {
      files.push({
        path: filePath,
        content: partialContent,
        language: languageMap[ext] || "text",
        isComplete: false,
        isGenerating: true,
      });
    }
  }

  if (files.length === 0) {
    console.warn(
      "[parseArtifact] 未找到文件，但保留 artifact 结构，内容片段:",
      content.substring(0, 200)
    );
    // 即使文件列表为空，也返回 artifact 结构，避免消息渲染异常
    return { id, title, files: [] };
  }

  // console.log(
  //   `[parseArtifact] 成功解析 ${files.length} 个文件:`,
  //   files.map((f) => f.path)
  // );
  return { id, title, files };
}

/**
 * 解析 Architect 规划（支持流式，新格式：文本而非 JSON）
 */
function parseArchitectPlan(content: string): ArchitectPlan | null {
  try {
    // 检查是否包含 architectPlan 标签
    if (!content.includes("<architectPlan")) {
      return null;
    }

    // 新格式：文本内容，不再解析 JSON
    // 只需要检测标签存在即可，内容会由 ThinkingCard 组件渲染
    const hasOpenTag = content.includes("<architectPlan>");
    const hasCloseTag = content.includes("</architectPlan>");

    if (hasOpenTag) {
      // 返回一个标记对象，表示这是 architect 消息
      return {
        mode: "create", // 默认模式，实际不再使用
        files: [], // 不再解析文件列表
        architecture_notes: "architect plan detected",
      };
    }

    return null;
  } catch (error) {
    console.error("[ArchitectPlan] 解析失败:", error);
    return null;
  }
}

/**
 * 合并历史 artifact 和新 artifact（乐观更新）
 * 用于在 modify 模式下保留未修改的文件
 */
function mergeArtifacts(
  previousArtifact: Artifact | null,
  newArtifact: Artifact | null
): Artifact | null {
  if (!newArtifact) return previousArtifact;
  if (!previousArtifact) return newArtifact;

  // 创建文件路径映射
  const fileMap = new Map<string, ParsedFile>();

  // 先添加所有历史文件
  previousArtifact.files.forEach((file) => {
    fileMap.set(file.path, file);
  });

  // 用新文件覆盖/添加
  newArtifact.files.forEach((file) => {
    fileMap.set(file.path, file);
  });

  // 转换回数组
  return {
    ...newArtifact,
    files: Array.from(fileMap.values()),
  };
}

/**
 * 解析消息的 Hook
 * 将所有解析逻辑集中在这里，组件只负责展示
 */
export function useMessageParser(
  content: string,
  isUser: boolean,
  previousArtifact?: Artifact | null
): ParsedMessageData {
  // 解析 artifact - 直接检查内容，不依赖 hasArtifact 参数
  const artifact = useMemo(() => {
    if (isUser) return null;
    const parsed = parseArtifactFromContent(content);
    // 乐观更新：合并历史文件和新文件
    return mergeArtifacts(previousArtifact || null, parsed);
  }, [content, isUser, previousArtifact]);

  // 解析 architect plan
  const architectPlan = useMemo(() => {
    if (isUser) return null;
    return parseArchitectPlan(content);
  }, [content, isUser]);

  // 判断消息类型
  const isArchitectMessage = !!architectPlan;
  // 修复：只在真正包含 boltArtifact 标签时才认为是代码生成消息
  const isCodingMessage = content.includes("<boltArtifact");

  return {
    artifact,
    architectPlan,
    isArchitectMessage,
    isCodingMessage,
    openingText: isCodingMessage ? extractOpeningText(content) : null,
    closingText: isCodingMessage ? extractClosingText(content) : null,
    architectOpeningText: isArchitectMessage
      ? extractArchitectOpeningText(content)
      : null,
    architectClosingText: isArchitectMessage
      ? extractArchitectClosingText(content)
      : null,
    architectPlanContent: isArchitectMessage
      ? extractArchitectPlanContent(content)
      : null,
  };
}

/**
 * 清理内容，移除内部标签
 */
export function cleanContent(content: string): string {
  let cleaned = content;
  cleaned = cleaned.replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/g, "");
  cleaned = cleaned.replace(/<architectPlan>[\s\S]*?<\/architectPlan>/g, "");
  cleaned = cleaned.replace(/^路由决策:.*$/gm, "");
  cleaned = cleaned.replace(/^网络连接错误.*$/gm, "");
  return cleaned.trim();
}
