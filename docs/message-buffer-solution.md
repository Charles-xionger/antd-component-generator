# 流式消息 Chunk 拆分问题解决方案

## 🎯 问题描述

在流式传输中，后端发送的内容会被拆分成多个小 chunk，导致前端无法正确识别完整的 XML 标签。

### 实际案例

```javascript
// 后端发送的数据被拆分成：
data: {"type":"content","content":"<","threadId":"..."}
data: {"type":"content","content":"architectPlan","threadId":"..."}
data: {"type":"content","content":">\n{\n","threadId":"..."}
data: {"type":"content","content":"  \"mode","threadId":"..."}
```

### 导致的问题

```typescript
// ❌ 错误的做法：对每个 chunk 单独判断
if (chunk.content.includes("<architectPlan>")) {
  // 这永远不会匹配，因为标签被拆分了
  renderArchitectCard();
}
```

---

## ✅ 解决方案：MessageBuffer

### 核心思路

使用**缓冲区累积**所有 chunk，基于**完整内容**进行判断，而不是单个 chunk。

```typescript
// ✅ 正确的做法：累积后判断
const buffer = new MessageBuffer();

chunks.forEach((chunk) => {
  const shouldShow = buffer.append(chunk.content, chunk.metadata);

  if (shouldShow) {
    displayContent(chunk.content);
  }

  // 基于累积的完整内容判断类型
  const type = buffer.getType(); // ARCHITECT_PLAN, CODE_ARTIFACT, etc.
});
```

---

## 🔧 使用方法

### 1. 在 use-chat.ts 中集成

```typescript
import { MessageBuffer } from "@/lib/message-filter";

export function useChat(options: UseChatOptions = {}) {
  // 为每条助手消息创建缓冲区
  const messageBufferRef = useRef<MessageBuffer | null>(null);

  const sendMessage = useCallback(async () => {
    // ... 发送用户消息

    // 创建新的助手消息和缓冲区
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
    };

    // 重置缓冲区
    messageBufferRef.current = new MessageBuffer();
    let fullContent = "";

    // 处理流式响应
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const data = JSON.parse(line.slice(6));

      if (data.type === "content") {
        // 使用缓冲区判断是否应该显示
        const shouldShow = messageBufferRef.current.append(
          data.content,
          data.metadata
        );

        if (!shouldShow) {
          continue; // 过滤此 chunk
        }

        // 累积显示内容
        fullContent += data.content;

        // 更新消息
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: fullContent }
              : msg
          )
        );

        // 检测特殊内容类型
        const type = messageBufferRef.current.getType();
        if (
          type === MessageType.CODE_ARTIFACT &&
          onArtifactDetectedRef.current
        ) {
          onArtifactDetectedRef.current(fullContent);
        }
      }
    }
  }, []);
}
```

---

### 2. MessageBuffer API

```typescript
class MessageBuffer {
  /**
   * 添加新的 chunk 到缓冲区
   * @returns 是否应该显示这个 chunk
   */
  append(chunk: string, metadata?: MessageMetadata): boolean;

  /**
   * 获取累积的完整内容
   */
  getContent(): string;

  /**
   * 获取当前消息类型
   */
  getType(): MessageType;

  /**
   * 重置缓冲区（开始新消息时调用）
   */
  reset(): void;
}
```

---

### 3. 消息类型

```typescript
enum MessageType {
  NORMAL = "normal", // 普通文本
  ARCHITECT_PLAN = "architect_plan", // 架构规划
  CODE_ARTIFACT = "code_artifact", // 代码生成
  INTERNAL = "internal", // 内部流程（应过滤）
}
```

---

## 📊 工作原理

### 数据流

```
Chunk 1: "<"
  └─> Buffer: "<"
  └─> Type: NORMAL
  └─> Show: true

Chunk 2: "architectPlan"
  └─> Buffer: "<architectPlan"
  └─> Type: ARCHITECT_PLAN (检测到!)
  └─> Show: true

Chunk 3: ">\n{\n"
  └─> Buffer: "<architectPlan>\n{\n"
  └─> Type: ARCHITECT_PLAN
  └─> Show: true

Chunk 4: "  \"mode..."
  └─> Buffer: "<architectPlan>\n{\n  \"mode..."
  └─> Type: ARCHITECT_PLAN
  └─> Show: true
```

### 过滤逻辑

```typescript
// 1. 元数据过滤（优先级最高）
if (metadata?.tags?.includes("routeToSubgraph")) {
  return false; // 直接过滤
}

// 2. 内容过滤（基于累积的完整内容）
if (buffer.startsWith("{") && buffer.includes('"next"')) {
  return false; // 路由决策 JSON
}

// 3. 类型识别（基于累积的完整内容）
if (buffer.includes("<architectPlan>")) {
  return MessageType.ARCHITECT_PLAN;
}
```

---

## 🎯 测试示例

详见 `test/message-buffer-test.ts`：

```typescript
// 测试场景 1：架构规划标签被拆分
const buffer = new MessageBuffer();
const chunks = [
  { content: "<" },
  { content: "architectPlan" },
  { content: ">\n{\n" },
  // ...
];

chunks.forEach((chunk) => {
  const shouldShow = buffer.append(chunk.content);
  console.log(`应该显示: ${shouldShow}`);
  console.log(`当前类型: ${buffer.getType()}`);
});
```

---

## ⚡ 性能优化

### 1. 避免频繁分类

```typescript
class MessageBuffer {
  private lastClassification: MessageType = MessageType.NORMAL;

  append(chunk: string, metadata?: MessageMetadata): boolean {
    this.buffer += chunk;

    // 只在累积后重新分类一次
    this.lastClassification = classifyMessageType(this.buffer);

    return true;
  }
}
```

### 2. 及时重置

```typescript
// 开始新消息时重置缓冲区
const assistantMessage = { id: Date.now(), role: "assistant", content: "" };
messageBufferRef.current.reset(); // 清空之前的累积
```

---

## 🔍 关键要点

### ✅ 正确做法

1. **基于累积内容判断**，不是单个 chunk
2. **使用缓冲区**存储完整内容
3. **元数据优先**进行快速过滤
4. **及时重置**避免污染下一条消息

### ❌ 常见错误

1. ~~对每个 chunk 单独判断标签~~
2. ~~使用正则表达式匹配部分内容~~
3. ~~依赖固定的 chunk 大小~~
4. ~~忘记重置缓冲区~~

---

## 📚 相关文件

- **实现**: `lib/message-filter.ts`
- **集成**: `hooks/use-chat.ts`
- **测试**: `test/message-buffer-test.ts`
- **架构**: `docs/stream-architecture.md`

---

## 🚀 扩展能力

### 1. 自定义过滤规则

```typescript
class MessageBuffer {
  private customFilters: Array<(content: string) => boolean> = [];

  addFilter(filter: (content: string) => boolean) {
    this.customFilters.push(filter);
  }

  private shouldFilterByContent(content: string): boolean {
    return this.customFilters.some((filter) => filter(content));
  }
}
```

### 2. 状态监听

```typescript
class MessageBuffer {
  private onTypeChange?: (type: MessageType) => void;

  append(chunk: string): boolean {
    const oldType = this.lastClassification;
    // ... 累积和分类
    const newType = this.lastClassification;

    if (oldType !== newType && this.onTypeChange) {
      this.onTypeChange(newType);
    }
  }
}
```

---

## 💡 总结

通过 `MessageBuffer` 类：

1. ✅ **解决了 chunk 拆分问题**：累积后判断，不依赖单个 chunk
2. ✅ **提供了统一的过滤接口**：元数据 + 内容双重过滤
3. ✅ **支持实时类型识别**：基于完整内容动态分类
4. ✅ **易于集成和扩展**：简单的 API，灵活的扩展点

这是处理流式传输标签拆分问题的**最佳实践**！✨
