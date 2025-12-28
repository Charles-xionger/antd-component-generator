# Stream 消息传递架构优化

## 📋 优化目标

将消息过滤和渲染逻辑从后端移到前端，实现**关注点分离**：

- **后端**：纯事件转发 + 数据持久化
- **前端**：智能过滤 + 灵活渲染

---

## 🏗️ 架构设计

### 职责划分

```
┌─────────────────────────────────────────────────────────────┐
│                         Backend                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ LangGraph AI │ -> │ Event Stream │ -> │   Database   │  │
│  │   生成内容    │    │   纯转发     │    │   持久化     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                            │                                 │
│                            ▼ (SSE + Metadata)                │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Message Filter│ -> │ Message Type │ -> │    Render    │  │
│  │   智能过滤    │    │    分类      │    │   组件选择    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 后端实现

### 核心原则：只做事件转发和数据持久化

```typescript
// app/api/agent/stream/route.ts

for await (const event of eventStream) {
  if (event.event === "on_chat_model_stream") {
    const content = event.data.chunk.content;

    // ✅ 转发事件 + 附加元数据
    controller.enqueue({
      type: "content",
      content,
      // 元数据供前端判断
      metadata: {
        tags: event.tags,
        name: event.name,
        runId: event.run_id,
      },
    });
  }
}

// ✅ 后处理：持久化到数据库
if (finalArtifact.includes("<boltArtifact")) {
  await saveToDatabase(finalArtifact);
}
```

### 移除的逻辑

- ❌ ~~内容过滤（FILTERED_NODES）~~
- ❌ ~~事件来源检查（isFilteredNode）~~
- ❌ ~~内容特征检测（isInternalContent）~~

---

## 🎨 前端实现

### 1. 消息过滤工具 (`lib/message-filter.ts`)

```typescript
/**
 * 决定是否过滤消息（不显示）
 */
export function shouldFilterMessage(chunk: ContentChunk): boolean {
  // 1. 检查节点类型
  if (chunk.metadata?.tags?.includes("routeToSubgraph")) {
    return true; // 过滤内部路由决策
  }

  // 2. 检查内容特征
  if (chunk.content.includes('{"next"')) {
    return true; // 过滤 JSON 决策
  }

  return false;
}

/**
 * 分类消息类型（决定如何渲染）
 */
export function classifyMessageType(content: string): MessageType {
  if (content.includes("<architectPlan>")) {
    return MessageType.ARCHITECT_PLAN; // 架构卡片
  }
  if (content.includes("<boltArtifact")) {
    return MessageType.CODE_ARTIFACT; // 代码面板
  }
  return MessageType.NORMAL; // 普通文本
}
```

### 2. 在 Hook 中应用过滤

```typescript
// hooks/use-chat.ts

if (data.type === "content") {
  const content = data.content;

  // ✅ 前端智能过滤
  const shouldFilter = shouldFilterMessage({
    type: "content",
    content,
    metadata: data.metadata,
  });

  if (shouldFilter) {
    continue; // 跳过此消息
  }

  // 累积并显示
  assistantContent += content;
  setMessages(/* ... */);
}
```

---

## 📊 数据流对比

### 优化前

```
AI 生成 -> 后端过滤 -> SSE 传输 -> 前端直接显示
           ^^^^^^^^
           耦合在后端
```

### 优化后

```
AI 生成 -> SSE 传输(含元数据) -> 前端过滤 -> 智能渲染
                                 ^^^^^^^^     ^^^^^^^^
                                 前端决策     灵活组件
```

---

## ✅ 优化效果

### 1. **关注点分离**

- 后端专注于数据流和持久化
- 前端专注于用户体验和展示

### 2. **更灵活的过滤策略**

- 无需重启后端即可调整过滤规则
- 可以根据用户设置动态调整

### 3. **更好的调试体验**

- 前端可以看到所有原始事件
- 可以在浏览器控制台实时调试过滤逻辑

### 4. **代码更简洁**

- 后端代码减少 ~40 行
- 逻辑更清晰易维护

---

## 🎯 消息类型处理策略

| 消息类型          | 后端处理      | 前端过滤 | 渲染方式 |
| ----------------- | ------------- | -------- | -------- |
| `routeToSubgraph` | 转发 + 元数据 | ✅ 过滤  | 不显示   |
| `<architectPlan>` | 转发 + 元数据 | ❌ 保留  | 架构卡片 |
| `<boltArtifact>`  | 转发 + 元数据 | ❌ 保留  | 代码面板 |
| 普通文本          | 转发 + 元数据 | ❌ 保留  | 文本消息 |
| 工具调用          | 转发          | ❌ 保留  | 工具卡片 |

---

## 📦 文件变更清单

### 修改的文件

1. **`app/api/agent/stream/route.ts`**

   - 移除过滤逻辑
   - 添加元数据传递
   - 简化工具调用处理

2. **`hooks/use-chat.ts`**
   - 添加过滤逻辑调用
   - 在消息累积前进行过滤

### 新增的文件

3. **`lib/message-filter.ts`**
   - 消息过滤工具
   - 消息类型分类
   - 完整性检查

---

## 🚀 未来扩展

### 1. 用户可配置过滤规则

```typescript
// 允许用户选择显示/隐藏某些消息类型
const [filterConfig, setFilterConfig] = useState({
  showArchitectPlan: true,
  showToolCalls: true,
  showInternalLogs: false, // 默认隐藏
});
```

### 2. 智能渲染组件

```typescript
// 根据消息类型自动选择渲染组件
function MessageRenderer({ content }) {
  const type = classifyMessageType(content);

  switch (type) {
    case MessageType.ARCHITECT_PLAN:
      return <ArchitectPlanCard content={content} />;
    case MessageType.CODE_ARTIFACT:
      return <CodePanel content={content} />;
    default:
      return <TextMessage content={content} />;
  }
}
```

### 3. 消息优先级和排序

```typescript
// 可以为不同类型的消息设置优先级
const MESSAGE_PRIORITY = {
  [MessageType.CODE_ARTIFACT]: 1,
  [MessageType.ARCHITECT_PLAN]: 2,
  [MessageType.NORMAL]: 3,
};
```

---

## 📝 总结

通过将过滤和渲染逻辑移到前端：

- ✅ 后端更专注（纯事件转发）
- ✅ 前端更灵活（智能过滤渲染）
- ✅ 代码更清晰（职责分离）
- ✅ 调试更方便（前端可控）

这是一个典型的**前后端职责分离**的优秀实践。
