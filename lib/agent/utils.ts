// lib/agent/utils.ts

export interface ParsedFile {
  path: string;
  content: string;
}

/**
 * 解析 Bolt XML 格式的代码输出
 * <boltArtifact id="xxx" title="xxx">
 *   <boltAction type="file" filePath="/path/to/file.tsx">
 *     // file content
 *   </boltAction>
 * </boltArtifact>
 */
export function parseXmlToMap(xmlContent: string): Map<string, string> {
  const fileMap = new Map<string, string>();

  if (!xmlContent) return fileMap;

  // 匹配所有 boltAction 标签
  const actionRegex =
    /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

  let match;
  while ((match = actionRegex.exec(xmlContent)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();

    // 清理内容，移除可能的代码块标记
    const cleanContent = content
      .replace(/^```[\w]*\n?/, "") // 移除开头的代码块标记
      .replace(/\n?```$/, "") // 移除结尾的代码块标记
      .trim();

    fileMap.set(filePath, cleanContent);
  }

  return fileMap;
}

/**
 * 解析出所有文件到数组格式
 */
export function parseXmlToFiles(xmlContent: string): ParsedFile[] {
  const fileMap = parseXmlToMap(xmlContent);
  return Array.from(fileMap.entries()).map(([path, content]) => ({
    path,
    content,
  }));
}

/**
 * 格式化现有代码为上下文字符串
 */
export function formatCodeContext(
  files: Array<{ path: string; content: string }>
): string {
  if (!files.length) return "这是一个新项目，没有现有代码。";

  return files
    .map((file) => `File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");
}

/**
 * 合并文件：旧文件 + 新修改 = 新快照
 * 这样即使 Agent 只输出了修改后的 App.tsx，新版本里依然包含未修改的 utils.ts
 */
export function mergeFiles(
  currentFiles: Array<{ path: string; content: string }>,
  generatedFilesMap: Map<string, string>
): Array<{ path: string; content: string }> {
  const nextFiles: Array<{ path: string; content: string }> = [];

  // 1. 遍历旧文件
  for (const file of currentFiles) {
    if (generatedFilesMap.has(file.path)) {
      // Agent 修改了这个文件，使用新内容
      nextFiles.push({
        path: file.path,
        content: generatedFilesMap.get(file.path)!,
      });
      generatedFilesMap.delete(file.path); // 标记已处理
    } else {
      // Agent 没动这个文件，继承旧内容
      nextFiles.push({
        path: file.path,
        content: file.content,
      });
    }
  }

  // 2. 处理 Agent 新增的文件 (剩下在 map 里的)
  generatedFilesMap.forEach((content, path) => {
    nextFiles.push({ path, content });
  });

  return nextFiles;
}

/**
 * 检测输入是否为代码相关请求
 */
export function isCodingRequest(message: string): boolean {
  const codingKeywords = [
    "代码",
    "组件",
    "页面",
    "功能",
    "实现",
    "开发",
    "react",
    "tsx",
    "jsx",
    "写一个",
    "创建",
    "修改",
    "添加",
    "删除",
    "优化",
    "bug",
    "错误",
    "component",
    "function",
    "hook",
    "state",
    "props",
    "css",
    "style",
    "计数器",
    "列表",
    "表单",
    "按钮",
    "输入框",
    "弹窗",
    "导航",
  ];

  const lowerMessage = message.toLowerCase();
  return codingKeywords.some((keyword) =>
    lowerMessage.includes(keyword.toLowerCase())
  );
}
