# 前后端消息协议规范

## 1. 用户输入消息格式

### 1.1 纯文本消息

```typescript
{
  message: string;          // 用户的文本输入
  images?: [];              // 空数组或不传
  threadId?: string;        // 会话 ID
}
```

### 1.2 带图片消息

```typescript
{
  message: string;          // 用户的文本描述
  images: Array<{
    dataUrl: string;        // base64 编码的图片 (data:image/png;base64,...)
    mime_type: string;      // MIME 类型 (image/png, image/jpeg, etc.)
  }>;
  threadId?: string;
}
```

## 2. 后端流式响应格式

### 2.1 SSE 事件类型

所有消息通过 SSE (Server-Sent Events) 格式传输：

```
data: {"type": "...", ...}\n\n
```

### 2.2 消息类型规范

#### 2.2.1 内容流式传输

```typescript
{
  type: "content",
  content: string,          // 增量内容（每个 chunk）
  threadId: string,
  metadata?: {
    node: "architect" | "coder",  // 标识来自哪个节点
    stage: "planning" | "coding"  // 标识当前阶段
  }
}
```

#### 2.2.2 工具调用开始

```typescript
{
  type: "tool_start",
  tool_call_id: string,
  tool_name: string,
  args: Record<string, any>,
  threadId: string
}
```

#### 2.2.3 工具调用结束

```typescript
{
  type: "tool_end",
  tool_call_id: string,
  tool_name: string,
  result: string,
  threadId: string
}
```

#### 2.2.4 完成信号

```typescript
{
  type: "done",
  threadId: string
}
```

#### 2.2.5 错误信号

```typescript
{
  type: "error",
  error: string
}
```

## 3. 后端响应内容格式

### 3.1 Architect 节点响应（规划阶段）

**包裹标签**: `<architectPlan>...</architectPlan>`

**JSON 结构**:

```json
{
  "mode": "create" | "modify",
  "requirements": {
    "description": "功能需求描述",
    "ui_components": ["Button", "Table", "Form"],
    "style_guide": {
      "layout": "布局描述",
      "colors": "配色方案",
      "spacing": "间距风格",
      "additional_notes": "其他样式细节"
    }
  },
  "files": [
    { "path": "App.tsx", "description": "文件描述" }
  ],
  "dependencies": ["antd", "@tanstack/react-query"],
  "architecture_notes": "架构说明"
}
```

**前端渲染要求**:

- 解析 `<architectPlan>` 标签
- 显示为"思考过程"卡片
- 展示规划的文件列表和架构说明
- 支持流式渲染（JSON 可能不完整）

### 3.2 Coder 节点响应（代码生成阶段）

**包裹标签**: `<boltArtifact id="..." title="...">...</boltArtifact>`

**文件格式**:

```xml
<boltArtifact id="unique-id" title="应用标题">
  <boltAction type="file" filePath="App.tsx">
  // 文件内容...
  </boltAction>
  <boltAction type="file" filePath="Component.tsx">
  // 文件内容...
  </boltAction>
</boltArtifact>
```

**前端渲染要求**:

- 解析 `<boltArtifact>` 标签获取 id 和 title
- 提取所有 `<boltAction type="file">` 标签
- **流式渲染规则**:
  1. 第一个文件：逐字符流式显示
  2. 后续文件：也应该逐字符流式显示（当前问题：突然蹦出）
  3. 文件列表：随着解析到新文件动态增加

## 4. 前端解析和渲染流程

### 4.1 消息解析流程

```
用户发送消息
    ↓
后端 SSE 流式响应
    ↓
前端接收 chunk
    ↓
解析器缓冲 (MessageBuffer)
    ↓
识别消息类型
    ├─ architect → 解析 <architectPlan>
    └─ coder → 解析 <boltArtifact>
    ↓
更新 UI 状态
```

### 4.2 Canvas 渲染流程

```
检测到 artifact
    ↓
解析文件列表 (use-artifact-parser)
    ├─ 阶段 1: 完整闭合的文件
    ├─ 阶段 2: 标签完整但内容未完成
    └─ 阶段 3: 标签不完整的文件
    ↓
更新 Canvas 状态
    ├─ 文件列表动态增加
    ├─ 选中文件内容流式更新
    └─ 预览面板等待完成后渲染
    ↓
完成信号 (type: "done")
    ↓
触发沙箱渲染
```

### 4.3 优化建议：文件级流式渲染

**当前问题**:

- 第一个文件流式显示 ✅
- 后续文件突然蹦出 ❌

**优化方案**:

1. **缓冲区改进**: 跟踪每个文件的解析进度
2. **增量更新**: 每个文件都支持增量内容追加
3. **视觉反馈**:
   - 文件列表显示"生成中..."状态
   - 代码编辑器显示光标动画
   - 进度条显示整体进度

**实现要点**:

```typescript
interface FileParseState {
  path: string;
  content: string; // 当前内容
  isComplete: boolean; // 是否完成
  isActive: boolean; // 是否正在写入
}

// 解析器应该返回
interface ParseResult {
  files: FileParseState[];
  currentFile: string; // 当前正在生成的文件路径
}
```

## 5. 错误处理

### 5.1 解析失败

- 宽容的正则匹配
- 缓冲不完整的 chunk
- 等待更多内容到达

### 5.2 流式中断

- 保存已解析的部分
- 显示友好的错误提示
- 提供重试机制

## 6. 性能优化

### 6.1 Token 优化

- Architect: 接收完整图片
- Coder: 接收完整图片 + Architect 的分析
- 历史消息: 只保留最近 1-3 轮对话

### 6.2 渲染优化

- 使用 React.memo 避免不必要的重渲染
- 虚拟滚动处理大量文件
- 代码编辑器懒加载

## 7. 调试支持

### 7.1 日志规范

```typescript
console.log("[Architect] 规划生成中...", plan);
console.log("[Coder] 第 1 个文件生成中...", file);
console.log("[Parser] 解析进度", { files: 3, current: "App.tsx" });
```

### 7.2 开发者工具

- 显示原始 SSE 消息
- 显示解析后的结构化数据
- 显示渲染状态和性能指标
