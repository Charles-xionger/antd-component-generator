# 🎨 AI Component Generator

基于 AI 的 React 组件智能生成平台，通过自然语言描述即可生成完整的前端代码，支持 Ant Design、Recharts 等主流组件库。

> **快速开始**: 5 分钟即可完成本地部署 👉 [跳转到安装指南](#-快速开始)

---

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

### 前置要求

确保你的开发环境满足以下条件：

- **Node.js** >= 18.0.0 ([下载地址](https://nodejs.org/))
- **pnpm** >= 8.0.0 (推荐使用 pnpm，也可用 npm/yarn)
- **PostgreSQL** >= 14 (本地安装或使用 [Supabase](https://supabase.com/) 云数据库)
- **AI API Key** (至少需要一个)：
  - [302.AI](https://302.ai) (推荐，支持多种模型)
  - [Google Gemini](https://aistudio.google.com/app/apikey)
  - [OpenAI](https://platform.openai.com)

---

### 第一步：克隆项目

```bash
git clone https://github.com/your-username/antd-component-generator.git
cd antd-component-generator
```

---

### 第二步：安装依赖

```bash
# 如果没有 pnpm，先安装
npm install -g pnpm

# 安装项目依赖
pnpm install
```

---

### 第三步：配置环境变量

1. **复制环境变量模板**

```bash
cp .env.example .env
```

2. **编辑 `.env` 文件**，填写以下必需配置：

```bash
# ==========================================
# 【必需】数据库配置
# ==========================================
# 本地 PostgreSQL (推荐用 Docker)
DATABASE_URL="postgresql://postgres:password@localhost:5432/ai_generator"

# 或使用 Supabase (免费 500MB)
# DATABASE_URL="postgresql://postgres.[项目ID]:[密码]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
# DIRECT_URL="postgresql://postgres.[项目ID]:[密码]@db.[项目ID].supabase.co:5432/postgres"

# ==========================================
# 【必需】Auth.js 配置
# ==========================================
# 生成密钥：openssl rand -base64 32
AUTH_SECRET="your-random-secret-here-replace-this"
NEXTAUTH_URL="http://localhost:3000"

# ==========================================
# 【可选】GitHub OAuth 登录
# ==========================================
# 如需 GitHub 登录，在 https://github.com/settings/developers 创建 OAuth App
# GITHUB_ID="your-github-oauth-client-id"
# GITHUB_SECRET="your-github-oauth-client-secret"

# ==========================================
# 【必需】AI 模型配置 (至少配置一个)
# ==========================================

# 选项 1: 302.AI (推荐，一个 Key 支持多个模型)
AI302_API_KEY="sk-xxx"
AI302_BASE_URL="https://api.302.ai/v1"

# 选项 2: Google Gemini
# GOOGLE_API_KEY="your-google-api-key"

# 选项 3: OpenAI
# OPENAI_API_KEY="sk-xxx"
```

> 💡 **提示**: 如果使用 Docker 启动本地 PostgreSQL：
>
> ```bash
> docker run -d \
>   --name postgres \
>   -e POSTGRES_PASSWORD=password \
>   -e POSTGRES_DB=ai_generator \
>   -p 5432:5432 \
>   postgres:15
> ```

---

### 第四步：初始化数据库

```bash
# 生成 Prisma 客户端
pnpm prisma generate

# 运行数据库迁移（创建表结构）
pnpm prisma migrate dev

# (可选) 打开 Prisma Studio 查看数据库
pnpm prisma studio
```

---

### 第五步：启动项目

```bash
# 开发模式
pnpm dev

# 项目将运行在 http://localhost:3000
```

打开浏览器访问 **[http://localhost:3000](http://localhost:3000)** 🎉

---

### 验证安装

如果一切正常，你应该能看到：

1. ✅ 登录页面正常显示
2. ✅ 可以创建新会话
3. ✅ 输入消息后 AI 开始生成代码
4. ✅ 右侧沙箱实时预览代码效果

---

### 常见问题

<details>
<summary><b>❌ 数据库连接失败</b></summary>

**错误信息**: `Can't reach database server at localhost:5432`

**解决方案**:

1. 确认 PostgreSQL 已启动：`pg_isready -h localhost -p 5432`
2. 检查 `DATABASE_URL` 格式是否正确
3. 确认用户名、密码、数据库名正确
</details>

<details>
<summary><b>❌ Prisma 迁移失败</b></summary>

**解决方案**:

```bash
# 重置数据库（会删除所有数据）
pnpm prisma migrate reset

# 重新运行迁移
pnpm prisma migrate dev
```

</details>

<details>
<summary><b>❌ AI 模型无响应</b></summary>

**检查清单**:

1. 确认 API Key 已正确配置在 `.env` 文件中
2. 检查 API Key 是否有效（访问对应平台确认）
3. 查看终端日志是否有错误信息
4. 确认网络可以访问对应的 API 端点
</details>

<details>
<summary><b>⚠️ 端口 3000 被占用</b></summary>

**解决方案**:

```bash
# 使用其他端口
PORT=3001 pnpm dev
```

</details>

---

### 生产环境部署

推荐部署平台：

- **Vercel** (推荐，Next.js 官方支持) - [部署指南](https://vercel.com/docs)
- **Netlify**
- **Railway**
- **自建服务器** (需配置 Node.js 环境)

**环境变量配置**：

- 在部署平台的环境变量设置中添加 `.env` 中的所有配置
- 将 `NEXTAUTH_URL` 改为你的域名（如 `https://your-domain.com`）
- 生产环境数据库建议使用 Supabase 或其他云数据库

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

````
antd-component-generator/
├── app/                       # Next.js App Router
│   ├── api/                   # API Routes
│   │   ├── agent/            # LangGraph Agent 流式响应
│   │   │   ├── stream/       # 主 Agent 入口
│   │   │   └── history/      # 会话历史
│   │   ├── artifact/         # 代码版本管理
│   │   │   └── save/         # 保存 Artifact
│   │   ├── mcp/              # MCP 服务器配置管理
│   │   │   └── configs/      # CRUD 接口
│   │   └── share/            # 分享功能
│   ├── page.tsx              # 首页
│   └── layout.tsx            # 布局
│
├── components/                # React 组件
│   ├── unified-chat.tsx      # 统一聊天界面（核心组件）
│   ├── chat/                 # 聊天相关组件
│   │   ├── input-bar.tsx     # 消息输入框
│   │   ├── message-item.tsx  # 消息展示
│   │   └── tool-call-card.tsx # 工具调用卡片
│   ├── canvas/               # 代码预览面板
│   │   ├── canvas-panel.tsx  # Canvas 主面板
│   │   ├── code-panel.tsx    # 代码编辑器
│   │   └── preview-panel.tsx # 实时预览
│   ├── mcp/                  # MCP 配置管理
│   │   └── config-panel.tsx  # MCP 配置面板
│   └── ui/                   # UI 基础组件
│
├── hooks/                     # React Hooks
│   ├── use-chat.ts           # 聊天逻辑（流式响应、停止生成）
1. 安装对应的 LangChain 集成包：

```bash
pnpm add @langchain/your-provider
````

2. 编辑 `lib/agent/index.ts`，在 `baseModelConfig` 中添加模型配置：

```typescript
const baseModelConfig = {
  modelName: process.env.MODEL_NAME || "your-model-name",
  apiKey: process.env.YOUR_API_KEY,
  temperature: 0.7,
  streaming: true,
};
```

3. 如果需要自定义 LLM 实例，修改 `createLLM` 函数。

---

### 自定义 Prompt

编辑 `lib/agent/prompts.ts` 文件：

```typescript
// Architect Prompt - 负责架构设计
export const ARCHITECT_PROMPT = `你是一位精通 React 的高级前端架构师...`;

// Coder Prompt - 负责代码实现
export const CODER_PROMPT = `你是一位追求极致代码整洁度的高级前端工程师...`;

// Supervisor Prompt - 负责路由决策
export const SUPERVISOR_PROMPT = `你需要判断用户请求...`;
```

**优化建议**:

- Architect 侧重架构设计、组件选择、文件规划
- Coder 侧重代码质量、最佳实践、细节实现
- 添加更多示例可以提高生成质量

---

### 扩展沙箱依赖

沙箱支持的依赖在 Prompt 中定义。编辑 `lib/agent/prompts.ts`：

```typescript
**可用的 npm 包**:
- react, react-dom
- antd (Ant Design)
- recharts (图表)
- lucide-react (图标)
- date-fns (日期处理)
// 添加新的依赖...
```

**注意**: 新增依赖后需要在 Sandpack 配置中添加支持。

---

### 集成 MCP (Model Context Protocol)

项目已内置 MCP 支持，可以让 AI 调用外部工具（如绘图、天气查询等）。

**快速开始**:

1. 启动一个 MCP 服务器（如 drawing-server）
2. 在界面添加 MCP 配置（名称 + URL）
3. 选择该配置后，AI 自动获取可用工具
4. 发送消息时 AI 会智能判断是否调用工具

**详细文档**: 查看 [docs/mcp-feature-summary.md](docs/mcp-feature-summary.md)

---路线图

### ✅ 已完成

- [x] 会话名称自动生成（基于 LLM）
- [x] 停止生成功能
- [x] 多模型支持（Qwen/Claude/Gemini）
- [x] Recharts 图表库支持
- [x] Markdown 文档渲染优化（streamdown 库）
- [x] MCP (Model Context Protocol) 集成
- [x] 三子图架构（chat/coding/mcp）
- [x] 流式响应优化

### 🚧 进行中

- [ ] 登录页样式优化，自定义 Logo
- [ ] 消息输入框支持粘贴图片
- [ ] 沙箱加载状态优化

### 📅 计划中

**近期计划**:

- [ ] 分享页面时效管理
- [ ] 更多 Spinner/Skeleton 组件
- [ ] Prompt 持续优化（中英文生成、准确性）
- [ ] 消息历史图片预览优化
- [ ] 代码导出为 CodeSandbox/StackBlitz 项目

**长期计划**指南

我们欢迎任何形式的贡献！

### 提交 Issue

- 🐛 **Bug 报告**: 请详细描述问题和复现步骤
- 💡 **功能建议**: 说明需求场景和预期效果
- 📚 **文档改进**: 指出不清楚或错误的地方

### 提交 Pull Request

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发规范

- 遵循 ESLint 规则
- 使用 TypeScript 类型定义
- 添加必要的注释
- 更新相关文档

---

## 📞 联系方式

- **问题反馈**: [GitHub Issues](https://github.com/your-username/antd-component-generator/issues)
- **功能建议**: [GitHub Discussions](https://github.com/your-username/antd-component-generator/discussions)

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## ⭐ Star History

如果这个项目对你有帮助，请给我们一个 Star ⭐️

---

**Built with ❤️ using Next.js, LangGraph, and AI**

---

## 📖 相关文档

- [MCP 功能文档](docs/mcp-feature-summary.md)
- [流式架构设计](docs/stream-architecture.md)
- [数据库迁移指南](docs/database-migration-guide.md)
- [Canvas 架构设计](docs/Canvas.md)

### 性能优化建议

1. **使用 Gemini Flash 模型**：速度快、成本低
2. **减少 Prompt 长度**：只包含必要的上下文
3. **限制消息历史长度**：保留最近 10-20 条消息
4. **缓存 Artifact**：避免重复生成相同代码
5. **沙箱懒加载**：首次打开时才渲染 配置
   ├── tailwind.config.ts # Tailwind CSS 配置
   └── package.json # 依赖管理

````

**核心文件说明**:

| 文件 | 说明 |
|------|------|
| `lib/agent/index.ts` | LangGraph 三子图架构：chat / coding / mcp |
| `lib/agent/nodes.ts` | Architect（架构设计）和 Coder（代码实现）节点 |
| `lib/agent/prompts.ts` | AI 的 System Prompt（决定生成质量的关键）|
| `hooks/use-chat.ts` | 流式响应处理、停止生成、Artifact 检测 |
| `hooks/use-canvas.ts` | 版本管理、沙箱通信、文件发送 |
| `components/unified-chat.tsx` | 聊天 + Canvas 的完整界面 |

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
````

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
