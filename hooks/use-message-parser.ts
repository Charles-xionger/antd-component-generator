// hooks/use-message-parser.ts
import { useMemo } from "react";
import type { Artifact, ParsedFile } from "@/components/canvas";

// 审查结果类型
export type ReviewResult = "approve" | "reject" | null;

export interface ReviewResultData {
  result: ReviewResult;
  reason?: string;
}

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
  reviewResult: ReviewResultData;
  isArchitectMessage: boolean;
  isCodingMessage: boolean;
  needsModification: boolean;
}

/**
 * 解析审查结果
 */
function parseReviewResult(content: string): ReviewResultData {
  const match = content.match(/<reviewer_result>([\s\S]*?)<\/reviewer_result>/);
  if (match) {
    const result = match[1].trim();
    if (result.toUpperCase().startsWith("APPROVE")) {
      return { result: "approve" };
    } else if (result.toUpperCase().startsWith("REJECT")) {
      return { result: "reject", reason: result.replace(/^REJECT:\s*/i, "") };
    }
  }
  if (content.includes("APPROVE")) return { result: "approve" };
  const rejectMatch = content.match(/REJECT:\s*(.+)/);
  if (rejectMatch) return { result: "reject", reason: rejectMatch[1] };
  return { result: null };
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
      isComplete: false,
      isGenerating: false,
    });
  }

  // 流式支持：尝试匹配未闭合的 boltAction 标签
  if (files.length === 0) {
    const partialFileRegex =
      /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)$/;
    const partialMatch = content.match(partialFileRegex);

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
          isGenerating: false,
        });
      }
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

  console.log(
    `[parseArtifact] 成功解析 ${files.length} 个文件:`,
    files.map((f) => f.path)
  );
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
 * 检查是否需要修改（审查未通过）
 */
function needsModification(
  content: string,
  reviewResult: ReviewResult
): boolean {
  if (reviewResult === "reject") return true;
  return content.includes("REJECT:") || content.includes("需要修改");
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

  // 解析审查结果
  const reviewResult = useMemo(() => {
    if (isUser) return { result: null as ReviewResult };
    return parseReviewResult(content);
  }, [content, isUser]);

  // 判断消息类型
  const isArchitectMessage = !!architectPlan;
  const isCodingMessage = !!artifact || content.includes("<boltArtifact");

  // 判断是否需要修改
  const needsModify = needsModification(content, reviewResult.result);

  return {
    artifact,
    architectPlan,
    reviewResult,
    isArchitectMessage,
    isCodingMessage,
    needsModification: needsModify,
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
  cleaned = cleaned.replace(/^REJECT:.*$/gm, "");
  return cleaned.trim();
}
