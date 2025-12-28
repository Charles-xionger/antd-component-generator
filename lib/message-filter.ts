/**
 * 消息过滤和分类工具
 * 负责前端的消息智能过滤和渲染决策
 *
 * 注意：由于流式传输会将标签拆分成多个 chunk（如 "<" + "architectPlan" + ">"）
 * 需要基于累积的完整内容进行判断，而不是单个 chunk
 */

export interface MessageMetadata {
  tags?: string[];
  name?: string;
  runId?: string;
}

export interface ContentChunk {
  type: "content";
  content: string;
  metadata?: MessageMetadata;
}

/**
 * 消息类型分类
 */
export enum MessageType {
  /** 普通文本消息 */
  NORMAL = "normal",
  /** 架构规划（应该渲染为卡片） */
  ARCHITECT_PLAN = "architect_plan",
  /** 代码生成（应该渲染为代码面板） */
  CODE_ARTIFACT = "code_artifact",
  /** 内部流程（应该过滤不显示） */
  INTERNAL = "internal",
}

/**
 * 消息缓冲器：处理流式传输时标签被拆分的问题
 */
export class MessageBuffer {
  private buffer = "";
  private lastClassification: MessageType = MessageType.NORMAL;

  /**
   * 添加新的 chunk 到缓冲区
   * @param chunk 新接收到的内容片段
   * @returns 是否应该显示这个 chunk
   */
  append(chunk: string, metadata?: MessageMetadata): boolean {
    // 1. 先检查元数据过滤（独立于内容）
    if (metadata && this.shouldFilterByMetadata(metadata)) {
      return false; // 过滤此 chunk
    }

    // 2. 累积到缓冲区
    this.buffer += chunk;

    // 3. 检查缓冲区内容是否应该过滤
    if (this.shouldFilterByContent(this.buffer)) {
      return false; // 过滤此 chunk
    }

    // 4. 更新消息类型（用于后续处理）
    this.lastClassification = classifyMessageType(this.buffer);

    return true; // 显示此 chunk
  }

  /**
   * 获取当前累积的完整内容
   */
  getContent(): string {
    return this.buffer;
  }

  /**
   * 获取当前消息类型
   */
  getType(): MessageType {
    return this.lastClassification;
  }

  /**
   * 重置缓冲区（开始新消息时调用）
   */
  reset(): void {
    this.buffer = "";
    this.lastClassification = MessageType.NORMAL;
  }

  /**
   * 基于元数据过滤
   */
  private shouldFilterByMetadata(metadata: MessageMetadata): boolean {
    const FILTERED_NODES = ["routeToSubgraph"];
    const eventTags = metadata.tags || [];
    const eventName = metadata.name || "";

    return FILTERED_NODES.some(
      (node) =>
        eventTags.includes(node) ||
        eventName.includes(node) ||
        eventName === node
    );
  }

  /**
   * 基于累积内容过滤
   */
  private shouldFilterByContent(content: string): boolean {
    // 检查是否为路由决策（JSON 格式）
    // 需要确保有足够的内容来判断
    if (content.length > 10) {
      const trimmed = content.trim();
      // 匹配类似 {"next": "..."}  的模式
      if (trimmed.startsWith("{") && trimmed.includes('"next"')) {
        return true;
      }
    }

    return false;
  }
}

/**
 * 判断消息是否应该被过滤（不显示）
 * @deprecated 建议使用 MessageBuffer 类来处理流式消息
 * 此函数仅用于完整消息的一次性判断
 */
export function shouldFilterMessage(chunk: ContentChunk): boolean {
  const { content, metadata } = chunk;

  if (!metadata) {
    return false;
  }

  // 1. 检查节点类型
  const FILTERED_NODES = ["routeToSubgraph"];
  const eventTags = metadata.tags || [];
  const eventName = metadata.name || "";
  const isFilteredNode = FILTERED_NODES.some(
    (node) =>
      eventTags.includes(node) || eventName.includes(node) || eventName === node
  );

  if (isFilteredNode) {
    console.log("[前端过滤] 内部流程消息:", {
      node: eventName || "unknown",
      contentPreview: content.substring(0, 50),
    });
    return true;
  }

  // 2. 检查内容特征（Supervisor 路由决策）
  // 注意：这里的判断对于流式传输可能不准确
  if (content.trim().startsWith("{") && content.includes('"next"')) {
    console.log("[前端过滤] 路由决策消息:", {
      contentPreview: content.substring(0, 50),
    });
    return true;
  }

  return false;
}

/**
 * 分类消息类型，用于决定渲染方式
 * 注意：此函数基于累积的完整内容进行判断，对流式传输友好
 */
export function classifyMessageType(content: string): MessageType {
  // 1. 检查是否包含架构规划标签（开始标签即可判断）
  if (
    content.includes("<architectPlan>") ||
    content.includes("<architectPlan")
  ) {
    return MessageType.ARCHITECT_PLAN;
  }

  // 2. 检查是否包含代码 artifact（开始标签即可判断）
  if (content.includes("<boltArtifact")) {
    return MessageType.CODE_ARTIFACT;
  }

  // 3. 检查是否为内部流程（需要更严格的判断）
  // 避免误判：只有当内容以 { 开头且包含 "next" 时才判断为内部流程
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && content.includes('"next"')) {
    return MessageType.INTERNAL;
  }

  // 4. 默认为普通消息
  return MessageType.NORMAL;
}

/**
 * 提取架构规划内容
 */
export function extractArchitectPlan(content: string): string | null {
  const match = content.match(/<architectPlan>([\s\S]*?)<\/architectPlan>/);
  return match ? match[1].trim() : null;
}

/**
 * 检查消息是否完整（用于流式处理）
 */
export function isMessageComplete(content: string, type: MessageType): boolean {
  switch (type) {
    case MessageType.ARCHITECT_PLAN:
      return content.includes("</architectPlan>");
    case MessageType.CODE_ARTIFACT:
      return content.includes("</boltArtifact>");
    default:
      return true; // 普通消息总是完整的
  }
}
