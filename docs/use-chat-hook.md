# useChat Hook 文档

## 概述

`useChat` 是一个用于管理聊天会话的核心 Hook，负责处理消息收发、流式响应、历史记录加载、工具调用追踪等功能。

## 职责范围

- 💬 **消息管理**：发送用户消息、接收 AI 回复
- 🌊 **流式处理**：实时处理 SSE 流式响应
- 📜 **历史加载**：根据 threadId 恢复对话历史
- 🛠️ **工具调用**：追踪工具执行状态（pending → running → success/error）
- 🔄 **状态管理**：加载状态、错误处理、请求取消
- 📸 **图片支持**：支持上传和发送图片

## 类型定义

### Message

```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasArtifact?: boolean; // 是否包含代码生成
  toolCalls?: ToolCall[]; // 工具调用列表
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  name: string; // 工具名称
  args: Record<string, unknown>; // 工具参数
  status: "pending" | "running" | "success" | "error";
  result?: string; // 执行结果
  error?: string; // 错误信息
}
```

### UseChatOptions

```typescript
interface UseChatOptions {
  /** API 端点，默认 /api/agent/stream */
  api?: string;

  /** 初始 threadId，用于恢复对话 */
  threadId?: string;

  /** MCP 配置 ID */
  mcpConfigId?: string | null;

  /** 检测到 artifact 时的回调（流式和最终） */
  onArtifactDetected?: (content: string) => void;

  /** 后端保存成功时的回调 */
  onSaved?: () => void;

  /** 流式响应开始时的回调 */
  onStreamStart?: () => void;

  /** 流式响应完成时的回调 */
  onStreamComplete?: (content: string) => void;

  /** 工具调用时的回调 */
  onToolCall?: (toolCall: ToolCall) => void;

  /** 发生错误时的回调 */
  onError?: (error: Error) => void;
}
```

## API

### 返回值

```typescript
{
  // 状态
  messages: Message[];          // 消息列表
  input: string;                // 输入框内容
  images: Array<{               // 上传的图片
    dataUrl: string;
    mime_type: string;
  }>;
  isLoading: boolean;           // 是否正在请求
  error: Error | null;          // 错误信息
  threadId?: string;            // 当前会话 ID

  // 输入控制
  setInput: (value: string) => void;
  setImages: (images: Array<...>) => void;
  handleSubmit: (e?: React.FormEvent) => void;

  // 消息操作
  sendMessage: () => Promise<void>;
  clearMessages: () => void;

  // 请求控制
  stop: () => void;             // 停止当前请求
}
```

## 使用示例

### 基础用法

```typescript
import { useChat } from "@/hooks/use-chat";

function ChatComponent() {
  const { messages, input, setInput, sendMessage, isLoading } = useChat({
    threadId: "thread-123",
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isLoading}
      />

      <button onClick={sendMessage} disabled={isLoading}>
        发送
      </button>
    </div>
  );
}
```

### 高级用法（带回调）

```typescript
const { messages, sendMessage, stop } = useChat({
  threadId: currentThreadId,
  mcpConfigId: selectedMcpConfig,

  // 流式响应开始
  onStreamStart: () => {
    console.log("开始生成回复...");
    createOptimisticVersion(); // 创建乐观更新版本
  },

  // 检测到代码生成
  onArtifactDetected: (content) => {
    setGeneratedCode(content); // 实时更新代码
  },

  // 流式响应完成
  onStreamComplete: (content) => {
    console.log("回复完成");
    saveArtifact(content); // 保存代码
  },

  // 工具调用
  onToolCall: (toolCall) => {
    console.log(`调用工具: ${toolCall.name}`);
  },

  // 错误处理
  onError: (error) => {
    toast.error(`发生错误: ${error.message}`);
  },
});
```

### 图片上传

```typescript
const { images, setImages, sendMessage } = useChat();

const handleImageUpload = (file: File) => {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    setImages([...images, { dataUrl, mime_type: file.type }]);
  };
  reader.readAsDataURL(file);
};
```

## 核心特性

### 1. 流式响应处理

使用 SSE (Server-Sent Events) 接收实时消息流：

```typescript
// 后端推送的数据格式
{
  type: "content",        // 消息内容
  content: "hello"
}

{
  type: "tool_start",     // 工具开始执行
  tool_name: "search",
  args: { query: "..." }
}

{
  type: "tool_end",       // 工具执行完成
  result: "..."
}
```

### 2. 消息缓冲机制

使用 `MessageBuffer` 处理流式传输时标签被拆分的问题：

```typescript
const messageBuffer = new MessageBuffer();

// 智能过滤内部消息
const shouldShow = messageBuffer.append(content, metadata);
if (!shouldShow) {
  console.log("过滤内部消息");
  continue;
}
```

### 3. 历史消息加载

自动检测 `threadId` 变化并加载历史：

```typescript
useEffect(() => {
  if (!threadId || historyLoadedRef.current === threadId) return;

  const fetchHistory = async () => {
    const response = await fetch(`/api/agent/history/${threadId}`);
    const data = await response.json();
    setMessages(formatMessagesFromHistory(data.messages));
    historyLoadedRef.current = threadId;
  };

  fetchHistory();
}, [threadId]);
```

### 4. 工具调用追踪

实时追踪工具执行状态：

```typescript
// 工具开始
{ type: "tool_start", tool_name: "search" }
→ toolCall.status = "running"

// 工具完成
{ type: "tool_end", result: "..." }
→ toolCall.status = "success"

// 工具失败
{ type: "tool_error", error: "..." }
→ toolCall.status = "error"
```

### 5. 请求取消

支持中断正在进行的请求：

```typescript
const abortControllerRef = useRef<AbortController | null>(null);

// 发送请求时
abortControllerRef.current = new AbortController();
fetch(url, { signal: abortControllerRef.current.signal });

// 取消请求
const stop = () => {
  abortControllerRef.current?.abort();
};
```

## 注意事项

### 1. 回调函数稳定性

所有回调函数通过 `ref` 存储，避免依赖变化：

```typescript
const onArtifactDetectedRef = useRef(onArtifactDetected);

useEffect(() => {
  onArtifactDetectedRef.current = onArtifactDetected;
});
```

### 2. 历史加载去重

使用 `historyLoadedRef` 防止重复加载：

```typescript
if (historyLoadedRef.current === threadId) {
  return; // 已加载过，跳过
}
```

### 3. 消息过滤

自动过滤内部消息（Supervisor 路由决策）：

```typescript
// 检测 Supervisor 的路由决策
const isSupervisorRoute =
  content.trim().startsWith("{") && content.includes('"next"');

if (isSupervisorRoute) {
  continue; // 跳过内部消息
}
```

### 4. Artifact 检测

检测消息中是否包含代码生成：

```typescript
const hasArtifact = assistantContent.includes("<boltArtifact");

if (hasArtifact && onArtifactDetectedRef.current) {
  onArtifactDetectedRef.current(assistantContent);
}
```

## 与其他 Hook 的配合

```typescript
// unified-chat.tsx
const chat = useChat({
  threadId,
  onArtifactDetected: (content) => {
    // 触发 canvas 更新
    canvas.setGeneratedCode(content);
  },
  onStreamStart: () => {
    // 创建乐观版本
    canvas.createOptimisticVersion();
  },
});

const canvas = useCanvas({ threadId });
```

## 性能优化

1. **消息去重**：通过 `id` 避免重复渲染
2. **回调稳定化**：使用 `ref` 避免无限循环
3. **条件触发**：只在必要时触发回调
4. **请求取消**：避免竞态条件

## 相关文件

- `lib/message-filter.ts` - 消息缓冲和过滤逻辑
- `app/api/agent/stream/route.ts` - 流式响应后端实现
- `components/unified-chat.tsx` - 使用此 Hook 的主组件

## 更新日志

- **2024-12**: 添加消息缓冲机制，解决标签拆分问题
- **2024-11**: 支持工具调用状态追踪
- **2024-10**: 初始版本，基础聊天功能
