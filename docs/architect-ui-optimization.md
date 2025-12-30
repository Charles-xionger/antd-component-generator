# Architect Plan UI 优化总结

## 问题分析

用户反馈 JSON 格式的 architectPlan 输出不利于阅读，希望：

1. 使用易读的文本格式（而非 JSON）
2. 放到折叠组件中展示
3. 支持流式输出

## 优化方案

### 1. Prompt 格式改进

#### 之前（JSON 格式）

```json
<architectPlan>
{
  "mode": "create",
  "requirements": {
    "description": "...",
    "ui_components": ["Button", "Table"]
  },
  "files": [...]
}
</architectPlan>
```

**问题**：

- JSON 格式难以阅读
- 流式解析 JSON 复杂
- 对 LLM 没有太大优势

#### 之后（Markdown 格式）

```markdown
<architectPlan>
## 📋 需求分析

[详细描述]

## 🎨 设计要点

### UI 组件

- Button（按钮）
- Table（表格）

### 样式风格

- **布局**：左侧导航 + 右侧内容区
- **配色**：主色蓝色、辅助色灰色

## 📁 文件结构

1. **App.tsx** - 应用主入口
2. **Component.tsx** - 核心业务组件

## 📦 依赖项

- antd
- @tanstack/react-query

## 💡 架构说明

[架构设计的关键考虑]
</architectPlan>
```

**优势**：

- ✅ Markdown 格式易读
- ✅ Emoji 标识清晰
- ✅ 流式渲染友好
- ✅ 对 LLM 更自然

### 2. UI 组件设计

#### ThinkingCard 组件

```tsx
<ThinkingCard content={planContent} duration="规划完成" isStreaming={false} />
```

**功能**：

- 可折叠的卡片组件
- 显示"架构规划"标题
- 流式状态指示器（🔵 生成中...）
- Markdown 格式渲染

**样式特点**：

- 参考 Claude 的 "Thought for 3s" 设计
- 简洁的图标和布局
- 支持暗色模式
- 流式生成时显示动画

### 3. 解析逻辑优化

#### 简化解析

```typescript
// 不再解析复杂的 JSON 结构
function parseArchitectPlan(content: string): ArchitectPlan | null {
  if (content.includes("<architectPlan>")) {
    return {
      files: [], // 从文本中提取
      dependencies: [],
      architecture_notes: "architect plan detected",
    };
  }
  return null;
}
```

#### 文件信息提取（nodes.ts）

```typescript
// 从 Markdown 文本中提取文件列表
const fileRegex = /\d+\.\s*\*\*(.+?)\*\*\s*-\s*(.+)/g;
while ((match = fileRegex.exec(filesText)) !== null) {
  files.push({
    path: match[1].trim(),
    description: match[2].trim(),
  });
}
```

### 4. 渲染流程

```
Architect 生成文本
    ↓
<architectPlan> 标签检测
    ↓
ThinkingCard 组件渲染
    ├─ 折叠状态（默认）
    ├─ 流式状态指示
    └─ Markdown 内容渲染
    ↓
用户点击展开
    ↓
格式化显示
    ├─ 标题 (##)
    ├─ 子标题 (###)
    ├─ 列表项 (-)
    ├─ 加粗文本 (**)
    └─ 行内代码 (`)
```

## 实现细节

### formatArchitectPlan 函数

```typescript
function formatArchitectPlan(content: string): string {
  // 移除标签
  let formatted = content
    .replace(/<architectPlan>/g, "")
    .replace(/<\/architectPlan>/g, "");

  // Markdown → HTML
  formatted = formatted.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  formatted = formatted.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  formatted = formatted.replace(/^- (.+)$/gm, "<li>$1</li>");
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/`(.+?)`/g, "<code>$1</code>");

  return formatted;
}
```

## 效果对比

### 优化前

```
[紫色卡片]
架构设计完成
规划了 5 个文件

[展开后]
📁 文件结构
- App.tsx: 应用主入口
- Component.tsx: 核心业务组件

📦 技术栈
antd, react-query

💡 架构说明
这是一个新项目...
```

### 优化后

```
[可折叠卡片] 💡 架构规划 | 规划完成 >

[展开后]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📋 需求分析

用户要实现一个数据管理系统，包含表格展示、
表单编辑和数据筛选功能...

## 🎨 设计要点

### UI 组件
- Button（按钮）
- Table（表格）
- Form（表单）

### 样式风格
- **布局**：左侧导航 + 右侧内容区
- **配色**：主色蓝色、辅助色灰色
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 技术优势

### 对 LLM

- ✅ 更自然的输出格式
- ✅ 无需严格的 JSON 结构
- ✅ 支持更自由的表达

### 对用户

- ✅ 易于阅读和理解
- ✅ 清晰的视觉层次
- ✅ 折叠/展开控制

### 对开发

- ✅ 简化解析逻辑
- ✅ 更好的流式支持
- ✅ 易于维护和扩展

## 文件清单

### 新增

- `components/chat/thinking-card.tsx` - 折叠卡片组件
- `docs/message-protocol.md` - 消息协议文档
- `docs/streaming-optimization.md` - 流式优化文档

### 修改

- `lib/agent/prompts.ts` - Architect Prompt 输出格式
- `lib/agent/nodes.ts` - 文本解析和文件提取
- `components/chat/message-item.tsx` - 使用 ThinkingCard
- `hooks/use-message-parser.ts` - 简化解析逻辑
- `components/chat/index.ts` - 导出 ThinkingCard

### 删除

- ❌ `ArchitectPlanCard` 组件（旧的紫色卡片）

## 测试建议

1. **流式渲染**：观察生成过程中的状态指示
2. **内容完整性**：确保所有 Markdown 格式正确渲染
3. **折叠状态**：测试展开/收起功能
4. **暗色模式**：验证暗色模式下的显示效果
5. **长内容**：测试大量文本的滚动和布局
