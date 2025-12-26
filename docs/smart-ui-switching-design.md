# 豆包风格 UI 设计方案

## 概述

本文档描述了一个参考豆包（Doubao）设计风格的 UI 方案。核心理念是**统一聊天界面 + 卡片式特殊内容 + 按需展开**，而不是传统的多模式切换。

## 设计理念

### 豆包风格的核心特点

1. **一切皆在消息流中**：Canvas、文档、工具结果等都以卡片形式嵌入消息流
2. **点击展开**：卡片可以点击展开为双栏模式进行深度编辑
3. **输入框状态提示**：当进入特殊模式时，输入框前缀显示当前上下文
4. **流畅的进入/退出**：展开和收起动画自然流畅

## 界面结构

### 单一聊天界面（默认状态）

```
┌─────────────────────────────────────┐
│  [MCP Server: 选择工具服务器 ▼]  ⚙️  │
├─────────────────────────────────────┤
│                                     │
│  💬 你好                             │
│  🤖 你好！有什么可以帮助你的吗？      │
│                                     │
│  💬 帮我写一个 Todo 应用             │
│  🤖 好的，我来创建一个 Todo 应用     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🎨 Canvas: Todo 应用        │   │
│  │ ├ App.tsx                   │   │
│  │ ├ useTodo.ts                │   │
│  │ └ +2 more files             │   │
│  │           [点击展开编辑 →]   │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  [输入消息...]                 [发送]│
└─────────────────────────────────────┘
```

**特点：**

- 所有内容都在消息流中
- Canvas 生成结果以卡片形式展示
- 卡片显示简要信息（标题、文件列表摘要）
- 用户可以点击卡片进入编辑模式

### Canvas 展开模式（双栏）

当用户点击 Canvas 卡片时，界面平滑展开为双栏：

```
┌──────────────────┬────────────────────────────┐
│  💬 Chat (35%)   │   🎨 Canvas (65%)          │
│                  │  ┌──────────────────────┐  │
│  帮我写一个      │  │ [Preview] [Code]  ✕ │  │
│  Todo应用        │  │                      │  │
│                  │  │   📱 [实时预览]      │  │
│  🤖 好的...      │  │                      │  │
│                  │  │  ☑ 买牛奶            │  │
│  ┌────────────┐  │  │  ☐ 写代码            │  │
│  │ 🎨 Todo应用│←─│──│  [+ 添加待办]        │  │
│  │ (当前编辑) │  │  │                      │  │
│  └────────────┘  │  └──────────────────────┘  │
│                  │  📁 App.tsx                │
│                  │     useTodo.ts             │
│                  │     styles.css             │
├──────────────────┴────────────────────────────┤
│  🎨 Canvas │ [修改输入框样式...]       [发送] │
└───────────────────────────────────────────────┘
```

**特点：**

- 左侧保留聊天记录（35%宽度）
- 右侧展示 Canvas 内容（65%宽度）
- 当前正在编辑的卡片高亮显示
- 输入框前缀显示 `🎨 Canvas` 标记
- 右上角有关闭按钮 ✕
- 继续对话会在当前 Canvas 上下文中进行

### MCP 工具调用卡片

工具调用结果也以卡片形式展示：

```
┌─────────────────────────────────────┐
│  💬 列出 OSS 中的文件               │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔧 工具调用: oss_file_list  │   │
│  │ ⏳ 执行中...                │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ✅ 工具执行完成              │   │
│  │ 📁 files/                   │   │
│  │    ├ image1.png             │   │
│  │    ├ document.pdf           │   │
│  │    └ data.json              │   │
│  │ 共 3 个文件                  │   │
│  └─────────────────────────────┘   │
│                                     │
│  🤖 OSS 中有以下 3 个文件...        │
│                                     │
└─────────────────────────────────────┘
```

## 核心组件

### 1. CanvasCard 组件

```typescript
// components/canvas-card.tsx
interface CanvasCardProps {
  artifact: {
    title: string;
    files: { path: string; content: string }[];
    version: number;
  };
  isActive: boolean;
  onClick: () => void;
}

export function CanvasCard({ artifact, isActive, onClick }: CanvasCardProps) {
  const displayFiles = artifact.files.slice(0, 3);
  const moreCount = artifact.files.length - 3;

  return (
    <div
      onClick={onClick}
      className={cn(
        "border rounded-lg p-3 cursor-pointer transition-all",
        "hover:border-blue-400 hover:shadow-md",
        isActive && "border-blue-500 bg-blue-50"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🎨</span>
        <span className="font-medium">{artifact.title}</span>
        <span className="text-xs text-gray-500">v{artifact.version}</span>
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        {displayFiles.map((file) => (
          <div key={file.path} className="flex items-center gap-1">
            <FileIcon path={file.path} />
            <span>{file.path}</span>
          </div>
        ))}
        {moreCount > 0 && (
          <div className="text-gray-400">+{moreCount} more files</div>
        )}
      </div>

      <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
        点击展开编辑 <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
}
```

### 2. ToolCallCard 组件

```typescript
// components/tool-call-card.tsx
interface ToolCallCardProps {
  toolName: string;
  status: "pending" | "running" | "success" | "error";
  result?: any;
  error?: string;
}

export function ToolCallCard({
  toolName,
  status,
  result,
  error,
}: ToolCallCardProps) {
  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🔧</span>
        <span className="font-medium">工具调用: {toolName}</span>
        <StatusBadge status={status} />
      </div>

      {status === "running" && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          执行中...
        </div>
      )}

      {status === "success" && result && (
        <div className="mt-2 text-sm">
          <ToolResultRenderer result={result} />
        </div>
      )}

      {status === "error" && error && (
        <div className="mt-2 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
```

### 3. UnifiedChat 组件

```typescript
// components/unified-chat.tsx
export function UnifiedChat({ threadId }: { threadId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);

  // 处理 Canvas 卡片点击
  const handleCanvasClick = (artifact: Artifact) => {
    setActiveArtifact(artifact);
    setIsCanvasExpanded(true);
  };

  // 关闭 Canvas 面板
  const handleCloseCanvas = () => {
    setIsCanvasExpanded(false);
    setActiveArtifact(null);
  };

  return (
    <div className="flex h-full">
      {/* 聊天面板 */}
      <div
        className={cn(
          "flex flex-col transition-all duration-300",
          isCanvasExpanded ? "w-[35%] border-r" : "w-full"
        )}
      >
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              onCanvasClick={handleCanvasClick}
              activeArtifactId={activeArtifact?.id}
            />
          ))}
        </div>

        {/* 输入框 */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2">
            {isCanvasExpanded && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                🎨 Canvas
              </span>
            )}
            <input
              placeholder={isCanvasExpanded ? "继续修改代码..." : "输入消息..."}
              className="flex-1 border rounded-lg px-4 py-2"
            />
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg">
              发送
            </button>
          </div>
        </div>
      </div>

      {/* Canvas 面板（条件渲染） */}
      {isCanvasExpanded && activeArtifact && (
        <div className="w-[65%] flex flex-col animate-slide-in-right">
          <CanvasPanel artifact={activeArtifact} onClose={handleCloseCanvas} />
        </div>
      )}
    </div>
  );
}
```

## 状态管理

### 界面状态

```typescript
interface UIState {
  // Canvas 展开状态
  isCanvasExpanded: boolean;
  activeArtifact: Artifact | null;

  // 当前选中的 MCP 配置
  selectedMcpId: string | null;

  // 输入框上下文
  inputContext: "chat" | "canvas";
}
```

### 消息中的特殊内容检测

```typescript
// 检测消息是否包含 Canvas 内容
function detectArtifact(content: string): Artifact | null {
  if (content.includes("<boltArtifact")) {
    return parseArtifactFromXml(content);
  }
  return null;
}

// 渲染消息时自动检测并展示卡片
function MessageItem({ message, onCanvasClick }: MessageItemProps) {
  const artifact = detectArtifact(message.content);

  return (
    <div className="space-y-2">
      {/* 文字内容 */}
      <div className="prose">{extractTextContent(message.content)}</div>

      {/* Canvas 卡片 */}
      {artifact && (
        <CanvasCard
          artifact={artifact}
          onClick={() => onCanvasClick(artifact)}
        />
      )}
    </div>
  );
}
```

## 交互流程

### 1. 代码生成流程

```
用户: "帮我写一个登录页面"
    ↓
AI 生成代码（流式输出）
    ↓
检测到 <boltArtifact> 标签
    ↓
在消息流中显示 Canvas 卡片
    ↓
用户点击卡片 → 展开双栏模式
    ↓
用户继续对话修改代码（输入框显示 🎨 Canvas 前缀）
    ↓
点击 ✕ 关闭 → 回到单栏聊天
```

### 2. MCP 工具调用流程

```
用户: "列出 OSS 中的文件"（已选择 MCP 服务器）
    ↓
Supervisor 路由到 MCP subgraph
    ↓
显示工具调用卡片（执行中状态）
    ↓
工具执行完成
    ↓
更新卡片显示结果
    ↓
AI 总结工具返回的信息
```

## 动画效果

### Canvas 展开动画

```css
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 300ms ease-out;
}
```

### 聊天面板收缩动画

```css
.chat-panel {
  transition: width 300ms ease-out;
}
```

## 与方案 A（模式选择器）的对比

| 特性         | 方案 A（模式选择器） | 豆包风格方案 |
| ------------ | -------------------- | ------------ |
| 界面复杂度   | 三个独立模式         | 统一界面     |
| 上下文保持   | 切换时可能丢失       | 始终保持     |
| 用户学习成本 | 需要理解三种模式     | 直觉式操作   |
| 特殊内容展示 | 独立界面             | 嵌入消息流   |
| 进入编辑     | 手动切换模式         | 点击卡片     |
| 适合场景     | Demo 演示            | 生产环境     |

## 总结

豆包风格的设计核心是**内容即入口**：

- ✅ 所有特殊内容（Canvas、工具结果）都以卡片形式嵌入消息流
- ✅ 点击卡片进入深度编辑模式
- ✅ 输入框状态提示当前上下文
- ✅ 流畅的展开/收起动画
- ✅ 无需手动切换模式，交互更直觉

这种设计更符合现代 AI 产品的交互范式，用户体验更加流畅自然。
