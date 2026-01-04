# useMessageParser Hook 文档

## 概述

`useMessageParser` 是一个用于解析消息内容的 Hook，专门处理聊天消息中的特殊标签（artifact、architectPlan），并提取三段式内容（开场白、标签内容、结束语）。

## 职责范围

- 🔍 **Artifact 解析**：提取 `<boltArtifact>` 标签中的代码
- 🏗️ **架构规划解析**：提取 `<architectPlan>` 标签中的规划内容
- 📝 **三段式内容拆分**：开场白、主要内容、结束语
- 🎯 **消息类型判断**：判断是架构消息还是代码生成消息
- 🌊 **流式支持**：处理不完整的标签

## 类型定义

### ArchitectPlan

```typescript
interface ArchitectPlan {
  mode: "create" | "modify";
  files?: Array<{
    path: string;
    description: string;
  }>;
  target_files?: string[];
  dependencies?: string[];
  architecture_notes?: string;
}
```

### ParsedMessageData

```typescript
interface ParsedMessageData {
  // 解析结果
  artifact: Artifact | null;
  architectPlan: ArchitectPlan | null;

  // 消息类型
  isArchitectMessage: boolean;
  isCodingMessage: boolean;

  // 三段式内容 - 代码生成
  openingText: string | null; // 开场白
  closingText: string | null; // 结束语

  // 三段式内容 - 架构规划
  architectOpeningText: string | null;
  architectClosingText: string | null;
  architectPlanContent: string | null;
}
```

## API

### Hook 签名

```typescript
useMessageParser(
  content: string,              // 消息内容
  isUser: boolean,              // 是否为用户消息
  previousArtifact?: Artifact | null  // 上一条消息的 artifact（用于合并）
): ParsedMessageData
```

### 返回值

所有解析结果都通过 `ParsedMessageData` 返回，包括：

- **解析结果**：artifact、architectPlan
- **消息类型**：isArchitectMessage、isCodingMessage
- **内容拆分**：开场白、标签内容、结束语

## 使用示例

### 基础用法

```typescript
import { useMessageParser } from "@/hooks/use-message-parser";

function MessageItem({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  const {
    artifact,
    isArchitectMessage,
    isCodingMessage,
    openingText,
    closingText,
  } = useMessageParser(content, isUser);

  if (isUser) {
    return <div>{content}</div>;
  }

  return (
    <div>
      {/* 开场白 */}
      {openingText && <p>{openingText}</p>}

      {/* 代码生成 */}
      {isCodingMessage && artifact && (
        <CodeGenerationCard artifact={artifact} />
      )}

      {/* 架构规划 */}
      {isArchitectMessage && <ThinkingCard content={content} />}

      {/* 结束语 */}
      {closingText && <p>{closingText}</p>}
    </div>
  );
}
```

### 架构规划消息

```typescript
function ArchitectMessage({ content }: { content: string }) {
  const {
    isArchitectMessage,
    architectOpeningText,
    architectPlanContent,
    architectClosingText,
  } = useMessageParser(content, false);

  if (!isArchitectMessage) return null;

  return (
    <div>
      {/* 开场白 */}
      {architectOpeningText && (
        <p className="text-muted-foreground">{architectOpeningText}</p>
      )}

      {/* 规划内容（Markdown 渲染） */}
      {architectPlanContent && (
        <div className="bg-blue-50 p-4 rounded">
          <ReactMarkdown>{architectPlanContent}</ReactMarkdown>
        </div>
      )}

      {/* 结束语 */}
      {architectClosingText && <p>{architectClosingText}</p>}
    </div>
  );
}
```

### Artifact 合并（modify 模式）

```typescript
function ChatMessageList({ messages }: { messages: Message[] }) {
  return (
    <>
      {messages.map((msg, index) => {
        // 获取上一条消息的 artifact
        const previousArtifact =
          index > 0
            ? useMessageParser(messages[index - 1].content, false).artifact
            : null;

        const parsed = useMessageParser(
          msg.content,
          msg.isUser,
          previousArtifact
        );

        return <MessageItem key={msg.id} message={msg} parsed={parsed} />;
      })}
    </>
  );
}
```

## 工具函数

除了主 Hook，还提供了独立的工具函数：

### extractOpeningText

提取开场白（标签之前的内容）：

```typescript
const openingText = extractOpeningText(content);

// 示例
"让我来实现这个功能\n<boltArtifact..."
→ "让我来实现这个功能"
```

### extractClosingText

提取结束语（标签之后的内容）：

```typescript
const closingText = extractClosingText(content);

// 示例
"...</boltArtifact>\n代码已生成完毕"
→ "代码已生成完毕"
```

### extractArchitectPlanContent

提取架构规划内容（支持流式）：

```typescript
const planContent = extractArchitectPlanContent(content);

// 完整标签
"<architectPlan>## 分析\n内容...</architectPlan>"
→ "## 分析\n内容..."

// 流式（未闭合）
"<architectPlan>## 分析\n正在生成"
→ "## 分析\n正在生成"
```

### cleanContent

清理内容，移除内部标签：

```typescript
const cleaned = cleanContent(content);

// 移除：
// - <boltArtifact>...</boltArtifact>
// - <architectPlan>...</architectPlan>
// - 路由决策信息
// - 网络连接错误信息
```

## 核心特性

### 1. 三段式内容拆分

```
开场白
<boltArtifact>...</boltArtifact>
结束语

↓ 解析为

{
  openingText: "开场白",
  artifact: {...},
  closingText: "结束语"
}
```

### 2. 流式支持

处理不完整的标签：

```typescript
// 完整标签
"<boltArtifact id='1'>...</boltArtifact>"
→ 正常解析

// 未闭合标签（流式）
"<boltArtifact id='1'>..."
→ 仍然能解析 artifact

// 只有开场白（标签未出现）
"让我来实现这个功能"
→ openingText: "让我来实现这个功能"
```

### 3. Artifact 合并

在 modify 模式下，合并历史和新 artifact：

```typescript
function mergeArtifacts(
  previousArtifact: Artifact | null,
  newArtifact: Artifact | null
): Artifact | null {
  if (!newArtifact) return previousArtifact;
  if (!previousArtifact) return newArtifact;

  // 创建文件映射
  const fileMap = new Map<string, ParsedFile>();

  // 先添加历史文件
  previousArtifact.files.forEach((file) => {
    fileMap.set(file.path, file);
  });

  // 用新文件覆盖/添加
  newArtifact.files.forEach((file) => {
    fileMap.set(file.path, file);
  });

  return {
    ...newArtifact,
    files: Array.from(fileMap.values()),
  };
}
```

### 4. 消息类型判断

```typescript
const isArchitectMessage = content.includes("<architectPlan");
const isCodingMessage = content.includes("<boltArtifact");

// 优先级：
// 1. 如果有 architectPlan，是架构消息
// 2. 如果有 boltArtifact，是代码生成消息
// 3. 否则是普通文本消息
```

## 性能优化

### useMemo 缓存

所有解析结果都使用 `useMemo` 缓存：

```typescript
const artifact = useMemo(() => {
  if (isUser) return null;
  const parsed = parseArtifactFromContent(content);
  return mergeArtifacts(previousArtifact || null, parsed);
}, [content, isUser, previousArtifact]);

const architectPlan = useMemo(() => {
  if (isUser) return null;
  return parseArchitectPlan(content);
}, [content, isUser]);
```

## 注意事项

### 1. 用户消息跳过解析

```typescript
if (isUser) {
  return {
    artifact: null,
    architectPlan: null,
    isArchitectMessage: false,
    isCodingMessage: false,
    // ...
  };
}
```

### 2. 架构规划新格式

之前是 JSON 格式，现在改为 Markdown 文本：

```typescript
// ❌ 旧格式（已废弃）
<architectPlan>
{
  "mode": "create",
  "files": [...]
}
</architectPlan>

// ✅ 新格式
<architectPlan>
## 分析

这是一个...

## 架构设计

- 文件1: ...
- 文件2: ...
</architectPlan>
```

### 3. 开场白识别规则

只在不包含标签特征时识别为开场白：

```typescript
const trimmed = content.trim();
if (trimmed && !trimmed.includes("<")) {
  // 不包含任何 < 字符，肯定是纯文本
  return trimmed;
}
```

### 4. 结束语需要闭合标签

只有标签完全闭合后才提取结束语：

```typescript
// ✅ 标签闭合
"...</boltArtifact>\n代码已生成"
→ closingText: "代码已生成"

// ❌ 标签未闭合
"...</boltArtifact\n代码已生成"
→ closingText: null
```

## 与其他组件的配合

### MessageItem 组件

```typescript
// components/chat/message-item.tsx
import { useMessageParser } from "@/hooks/use-message-parser";

export function MessageItem({ message, previousArtifact }) {
  const parsed = useMessageParser(
    message.content,
    message.isUser,
    previousArtifact
  );

  return (
    <>
      {parsed.openingText && <Markdown>{parsed.openingText}</Markdown>}
      {parsed.isCodingMessage && (
        <CodeGenerationCard artifact={parsed.artifact} />
      )}
      {parsed.isArchitectMessage && <ThinkingCard content={message.content} />}
      {parsed.closingText && <Markdown>{parsed.closingText}</Markdown>}
    </>
  );
}
```

## 相关文件

- `hooks/use-artifact-parser.ts` - Artifact 解析引擎（复用）
- `components/chat/message-item.tsx` - 主要使用者
- `components/chat/thinking-card.tsx` - 架构规划展示
- `components/chat/code-generation-card.tsx` - 代码生成展示

## 测试

测试用例：

```typescript
// 完整消息
const content1 = `
让我实现这个功能
<boltArtifact id="1" title="App">
  <boltAction type="file" filePath="App.tsx">
    code...
  </boltAction>
</boltArtifact>
代码已生成完毕
`;

const parsed1 = useMessageParser(content1, false);
// openingText: "让我实现这个功能"
// artifact: { id: "1", title: "App", files: [...] }
// closingText: "代码已生成完毕"

// 流式消息（未完成）
const content2 = `
开始生成代码
<boltArtifact id="1" title="App">
  <boltAction type="file" filePath="App.tsx">
    const App = () => {
`;

const parsed2 = useMessageParser(content2, false);
// openingText: "开始生成代码"
// artifact: { files: [{ path: "App.tsx", isGenerating: true }] }
// closingText: null
```

## 更新日志

- **2026-01**: 移除 reviewResult 和 needsModification 相关逻辑（后端已剔除审查节点）
- **2024-12**: 架构规划改为 Markdown 格式
- **2024-11**: 添加 Artifact 合并功能
- **2024-10**: 添加三段式内容拆分
- **2024-09**: 初始版本
