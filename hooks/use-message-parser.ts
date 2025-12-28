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
        });
      }
    }
  }

  if (files.length === 0) {
    console.warn(
      "[parseArtifact] 未找到文件，内容片段:",
      content.substring(0, 200)
    );
    return null;
  }

  console.log(
    `[parseArtifact] 成功解析 ${files.length} 个文件:`,
    files.map((f) => f.path)
  );
  return { id, title, files };
}

/**
 * 解析 Architect 规划（支持流式）
 */
function parseArchitectPlan(content: string): ArchitectPlan | null {
  try {
    // 阶段 1: 尝试完整的标签匹配
    const fullMatch = content.match(
      /<architectPlan>\s*([\s\S]*?)\s*<\/architectPlan>/
    );

    if (fullMatch) {
      const jsonStr = fullMatch[1].trim();
      const plan = JSON.parse(jsonStr);

      if (plan.mode && (plan.mode === "create" || plan.mode === "modify")) {
        return plan;
      }
    }

    // 阶段 2: 如果没有闭合标签，尝试解析未完成的内容（流式展示）
    const partialMatch = content.match(/<architectPlan>\s*([\s\S]*?)$/);
    if (partialMatch) {
      try {
        // 尝试解析不完整的 JSON（可能缺少闭合括号）
        const jsonStr = partialMatch[1].trim();

        // 如果 JSON 不完整，尝试补全
        if (jsonStr && !jsonStr.endsWith("}")) {
          // 尝试多种补全策略
          const attempts = [
            jsonStr, // 原样
            jsonStr + '"}', // 补全字符串引号和对象
            jsonStr + "}", // 补全对象
            jsonStr + '"]', // 补全数组
            jsonStr + "]", // 补全数组后的对象
          ];

          for (const attempt of attempts) {
            try {
              const plan = JSON.parse(attempt);
              if (plan.mode) {
                console.log("[ArchitectPlan] 流式解析成功（不完整）");
                return plan;
              }
            } catch {
              continue;
            }
          }
        } else {
          // JSON 看起来完整，直接解析
          const plan = JSON.parse(jsonStr);
          if (plan.mode) {
            return plan;
          }
        }
      } catch {
        // 流式解析失败是正常的，等待更多内容
        console.log("[ArchitectPlan] 等待更多内容...");
      }
    }

    // 阶段 3: Fallback - 直接解析整个内容（如果是纯 JSON）
    if (content.trim().startsWith("{") && content.trim().includes('"mode"')) {
      try {
        const plan = JSON.parse(content.trim());
        if (plan.mode && (plan.mode === "create" || plan.mode === "modify")) {
          console.warn("[ArchitectPlan] 缺少标签包裹，但成功解析");
          return plan;
        }
      } catch {
        // 忽略 fallback 失败
      }
    }

    return null;
  } catch (error) {
    // 只在非预期错误时输出
    if (!(error instanceof SyntaxError)) {
      console.error("[ArchitectPlan] 解析失败:", error);
      console.error("原始内容:", content.substring(0, 200));
    }
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
