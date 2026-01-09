# 🎨 Ant Design Component Generator

基于 AI 的 React 组件智能生成平台，通过自然语言描述即可生成完整的 Ant Design 组件代码。

## ✨ 核心特性

### 🤖 AI 驱动的代码生成

- **双阶段生成**：Architect（架构设计） → Coder（代码实现）
- **多模型支持**：Qwen、Claude、Gemini 等主流 LLM
- **智能理解**：支持文字描述 + 图片识别，准确理解设计意图
- **实时预览**：边生成边预览，所见即所得

### 🎯 技术栈

- **前端框架**：Next.js 15 + React 19 + TypeScript
- **AI 框架**：LangGraph（Architect → Coder 工作流）
- **UI 组件**：Ant Design + Tailwind CSS + Shadcn/ui
- **状态管理**：Zustand
- **数据库**：PostgreSQL (Supabase) + Prisma ORM
- **图表库**：Recharts
- **沙箱环境**：Browser Sandpack（实时代码执行）

### 🚀 功能亮点

#### 1. 智能架构设计

- 自动分析需求并生成文件结构
- 选择合适的 UI 组件和技术栈
- 遵循最佳实践和代码规范

#### 2. 实时代码预览

- 浏览器沙箱实时渲染
- 多版本管理和切换
- 代码编辑器集成

#### 3. 会话管理

- ✅ **智能标题生成**：根据对话内容自动生成有意义的会话标题
- 多会话并行
- 收藏和重命名
- 完整的历史记录

#### 4. 交互优化

- ✅ **停止生成**：代码生成过程中可随时停止
- 图片上传识别
- 实时生成进度
- 流式响应

#### 5. 代码分享

- 一键生成分享链接
- 独立的预览页面
- 代码查看和下载

## 🛠️ 技术架构

### LangGraph 工作流

```
用户输入 → Architect (架构设计)
              ↓
          生成 <architectPlan>
              ↓
          Coder (代码实现)
              ↓
          生成 <boltArtifact>
              ↓
          保存到数据库 + 沙箱渲染
```

### 数据库设计

```prisma
- User: 用户信息
- Account: OAuth 账号
- Thread: 会话（自动生成标题）
- Artifact: 代码版本
- ArtifactVersion: 版本历史
- ArtifactFile: 文件内容
- SharedArtifact: 分享记录
```

## 📦 快速开始

### 1. 环境准备

```bash
# Node.js 18+
# PostgreSQL 数据库
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 环境变量配置

创建 `.env.local` 文件：

```bash
# 数据库
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth (可选)
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."

# AI 模型 API Keys
ALIYUN_API_KEY="..."              # Qwen
GOOGLE_API_KEY="..."              # Gemini
AI302_API_KEY="..."               # Claude via 302.ai
```

### 4. 数据库初始化

```bash
# 生成 Prisma Client
pnpm prisma generate

# 运行数据库迁移
pnpm prisma migrate dev
```

### 5. 启动开发服务器

```bash
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 🎯 使用指南

### 基础使用

1. **登录系统**：支持 GitHub OAuth
2. **创建会话**：点击"新建会话"
3. **描述需求**：输入自然语言描述或上传设计图
4. **生成代码**：AI 自动生成完整的 React 组件
5. **实时预览**：在右侧面板查看渲染效果
6. **代码编辑**：支持在线编辑和调试
7. **版本管理**：查看和切换不同版本
8. **分享链接**：一键分享给他人

### 高级功能

- **停止生成**：生成过程中点击红色方块停止
- **图片识别**：上传 UI 设计图，AI 自动识别布局
- **会话标题**：首次对话后自动生成智能标题
- **多模型切换**：选择不同的 AI 模型
- **代码下载**：导出完整项目代码

## 📚 项目结构

```
antd-component-generator/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── agent/        # LangGraph Agent
│   │   ├── artifact/     # 代码版本管理
│   │   └── share/        # 分享功能
│   ├── home-client.tsx   # 主页面
│   └── page.tsx          # 入口
├── components/            # React 组件
│   ├── chat/             # 聊天界面
│   ├── canvas/           # 代码预览
│   └── ui/               # UI 组件
├── hooks/                 # React Hooks
│   ├── use-chat.ts       # 聊天逻辑
│   └── use-canvas.ts     # Canvas 逻辑
├── lib/                   # 核心库
│   ├── agent/            # LangGraph Agent
│   │   ├── index.ts      # Graph 定义
│   │   ├── nodes.ts      # Architect & Coder
│   │   ├── prompts.ts    # System Prompts
│   │   └── models.ts     # LLM 配置
│   └── database/         # 数据库
├── prisma/               # Prisma Schema
└── stores/               # Zustand Stores
```

## 🔧 开发指南

### 添加新的 AI 模型

编辑 `lib/agent/models.ts`：

```typescript
export function createLLM(modelName: string, config: ModelConfig) {
  if (modelName.startsWith("your-model")) {
    return new ChatYourModel({
      model: modelName,
      apiKey: process.env.YOUR_API_KEY,
      temperature: config.temperature,
    });
  }
  // ... 其他模型
}
```

### 自定义 Prompt

编辑 `lib/agent/prompts.ts`：

```typescript
export const ARCHITECT_PROMPT = `你是一位精通 React 的高级前端架构师...`;
export const CODER_PROMPT = `你是一位追求极致代码整洁度的高级前端工程师...`;
```

### 扩展沙箱依赖

在 Architect 和 Coder 的 Prompt 中更新可用依赖列表。

## 📝 待办事项

### 高优先级

- [ ] 登录页样式优化，自定义 Logo
- [ ] 消息输入框支持粘贴图片
- [ ] 分享页面时效管理

### 中优先级

- [ ] 沙箱加载状态优化
- [ ] 更多 Spinner/Skeleton 组件
- [ ] Prompt 持续优化（中英文生成、准确性）
- [ ] 消息历史图片预览优化

### 低优先级

- [ ] 生产环境沙箱部署方案（沙箱池、多用户隔离）
- [ ] MCP (Model Context Protocol) 集成

### ✅ 已完成

- [x] 会话名称自动生成（基于 LLM）
- [x] 停止生成功能
- [x] 多模型支持（Qwen/Claude/Gemini）
- [x] Recharts 图表库支持
- [x] Markdown 文档渲染优化 使用 streamdown 库

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

---

**Built with ❤️ using Next.js, LangGraph, and AI**
