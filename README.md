# Prompt Web

Prompt Web 是一个从自然语言需求到可分享 Web 应用的 AI 构建与发布产品。

用户描述想解决的业务问题，系统负责理解需求、规划页面与数据、生成前后端、运行验证，并把通过检查的版本发布为一个可以交给他人使用的 URL。

> 产品目标不是展示“AI 会写多少代码”，而是让第一次使用的人在几分钟内完成：提出想法 → 得到目标页面 → 修改 → 发布 → 分享使用。

## 当前状态

项目已经具备端到端技术主链路，正在从开发者原型迭代为可稳定演示的成熟产品。

已具备：

- 自然语言与图片输入，多模型支持。
- RequirementSpec → AppBlueprint → 代码生成的结构化生成流程。
- React 页面、Go 业务服务、PostgreSQL 关系表和向前兼容 SQL Migration 生成。
- 浏览器快速预览，以及真实容器中的全栈预览。
- ArtifactVersion 不可变版本、项目历史和版本切换。
- 构建、Migration、健康检查与 API acceptance 场景验证。
- DRAFT / PRODUCTION 数据隔离。
- 发布、固定访问地址、重新发布、下线与版本回滚。

正在重点补齐：

- 一致、现代的主工作区 UI/UX。
- 预览优先的生成、修改和发布旅程。
- 局部选择修改、版本差异和一键撤销。
- 浏览器 E2E、UI 验收与可重复的现场演示基线。
- 更清晰的失败恢复、发布状态和上线反馈。

详细目标见 [产品目标与成熟度标准](docs/product-goals.md)，演示范围见 [目标案例](docs/demo-cases.md)。

## 产品定位

Prompt Web 不以“通用能力超过所有成熟 AI 建站产品”为目标。当前聚焦企业内部轻应用和数据型工具，例如项目台账、运营看板、客户跟进、内容生产管理。

它重点验证三个价值：

1. **从业务语言到可用结果**：用户不需要理解项目脚手架、数据库迁移或部署配置。
2. **生成结果可以继续使用**：页面连接真实数据，发布后拥有稳定 URL，并支持后续修改和回滚。
3. **AI 过程可以被理解和控制**：复杂任务有计划、有状态、有检查点，失败时能够定位和恢复。

现阶段的差异化不来自模型数量或 Agent 数量，而来自对一个完整交付闭环的打磨：

```text
描述目标
  → 确认页面 / 数据 / 操作
  → 实时看到生成结果
  → 对目标区域进行修改
  → 自动检查可用性
  → 发布为稳定 URL
  → 分享给真实用户
```

## 现场演示标准

项目达到“可演示”必须同时满足：

- 新用户不依赖讲解，可以识别入口并开始生成。
- 一个黄金案例可以在 5 分钟左右完成生成、局部修改和发布。
- 页面、数据、主要交互和移动端布局符合案例验收标准。
- 生成过程使用用户语言展示“理解、设计、构建、检查”，不暴露内部消息噪音。
- 发布后立即得到可复制、可打开的稳定 URL。
- 任一步骤失败都有明确原因、重试入口或安全回退版本。
- 黄金案例连续 10 次无人为修复走通，才进入现场演示版本。

## 黄金演示案例

第一优先级案例是“短剧分镜产能管理台”。仓库已有对应全栈验收 fixture，可复用人员、项目、分镜任务、工时和产能统计数据，最适合先建立稳定演示基线。

演示过程：

1. 从案例库选择“短剧分镜产能管理台”。
2. 补充一句目标，例如“突出本周延期任务和团队产能差异”。
3. 确认系统整理出的页面、数据与操作 Brief。
4. 在预览中查看统计卡、趋势图和任务表。
5. 选中统计卡，要求改成周趋势并突出异常。
6. 切换移动端预览并打开真实全栈版本。
7. 检查通过后发布，复制 URL，在无登录窗口打开。

后续案例包括客户跟进台账和活动报名管理，完整范围与验收条件见 [目标案例](docs/demo-cases.md)。

## AI Agent 设计

Prompt Web 使用一个可持久化、可使用工具的 Web 应用 Agent。`Think`、`Explore`、`Plan`、`Execute` 和 `Verify` 是同一循环的状态，不强制用户依次经过多个角色式 Agent。

当前核心链路：

```text
用户输入
  → Intent Router
  → RequirementSpec
  → AppBlueprint
  → React + Go + SQL + Acceptance
  → Artifact Validator
  → Browser Sandbox
  → Full-stack Build Job
  → DRAFT Preview + Acceptance
  → PRODUCTION Deployment
```

Agent 相关的核心学习与面试主题：

- 意图路由与任务分解。
- Structured Output 与契约约束。
- Tool Use 与真实工作区执行。
- 状态持久化、Checkpoint、中断与恢复。
- 自动验证、Evidence 和完成条件。
- Human-in-the-loop 与发布边界。
- Agent 可观测性、失败分类和重试策略。

架构方向见项目根目录的 [`AGENT.md`](../AGENT.md)。

## 系统架构

```text
Next.js Product UI
├── Chat / Plan / Progress
├── Canvas Preview / Code / Versions
└── Publish / Deployment Center

LangGraph Agent
├── intentRouter
├── businessAnalyst
├── solutionArchitect
├── coder
└── artifactValidator

Preview & Runtime
├── Browser Sandbox: Vite + esbuild-wasm
└── Go Full-stack Runtime
    ├── React static assets
    ├── Go API
    ├── PostgreSQL Schema
    ├── SQL Migration
    └── Acceptance scenarios

Delivery
├── Build Worker
├── Docker Socket Proxy
├── Traefik routing
└── ArtifactVersion / BuildJob / Deployment
```

Go 运行时细节见 [Go 全栈轻应用运行时](docs/go-fullstack-runtime.md)。

## 技术栈

- Next.js 16、React 19、TypeScript
- LangGraph、Qwen / Claude / Gemini
- Ant Design、Tailwind CSS、shadcn/ui、Recharts
- PostgreSQL、Prisma、LangGraph Postgres Checkpoint
- 独立 Vite Sandbox、esbuild-wasm
- Go 1.24、pgx、Docker、Traefik
- Zustand、TanStack Query、Zod

## 本地启动

完成依赖和数据库初始化后，推荐从主应用目录一次启动 Web、Workspace Agent Worker、Build Worker 与 Sandbox：

```bash
pnpm dev:all
```

`dev:all` 会在任一关键进程退出时停止其余子进程，避免页面仍可访问、但工作区任务因 Agent Worker 缺失而永久停在 `QUEUED`。如果 Sandbox 不在相邻的 `../antd-sandbox`，请通过绝对路径设置 `SANDBOX_DIR`。

### 环境要求

- Node.js >= 20.19.0，推荐 Node.js 22
- pnpm >= 9
- PostgreSQL >= 14
- GitHub OAuth App
- 至少一个可用的模型 API Key
- 独立仓库 `antd-sandbox`

### 1. 安装依赖

```bash
cd antd-component-generator
pnpm install --frozen-lockfile

cd ../antd-sandbox
pnpm install --frozen-lockfile
```

### 2. 配置环境变量

```bash
cd ../antd-component-generator
cp .env.example .env
```

至少填写：

```dotenv
DATABASE_URL="postgresql://postgres:password@localhost:5432/ai_generator"
AUTH_SECRET="replace-with-a-random-secret"
NEXTAUTH_URL="http://localhost:3000"
GITHUB_ID="your-github-oauth-app-client-id"
GITHUB_SECRET="your-github-oauth-app-client-secret"

# 至少配置一组模型
ALIYUN_API_KEY="your-dashscope-api-key"
ALIYUN_BASE_URL="https://your-workspace-id.your-region.maas.aliyuncs.com/compatible-mode/v1"
```

完整配置及生产运行时变量见 [`.env.example`](.env.example)。

### 3. 初始化数据库

```bash
pnpm prisma:generate
pnpm prisma:migrate:dev
```

### 4. 启动预览沙箱

```bash
cd ../antd-sandbox
pnpm dev
```

默认地址为 `http://localhost:5174/sandbox.html`。

### 5. 启动主应用

```bash
cd ../antd-component-generator
pnpm dev
```

访问 `http://localhost:3000`。

### 6. 启动工作区 Agent 与全栈构建 Worker

新建和修改应用会排队为数据库中的 Workspace Agent 任务。主应用 HTTP 进程不会执行任务；需要另起持续运行的 Worker：

```bash
pnpm worker:agent
```

Go 全栈工作区校验还需先在该 Worker 可访问的 Docker daemon 中构建固定校验镜像：

```bash
pnpm build:workspace-validator
```

Worker 必须与主应用连接同一数据库，并具备模型 API 凭据。生产部署需将其配置为独立、自动重启的服务；否则新任务会一直停在 `QUEUED`。

全栈 Preview 与发布另需启动构建 Worker：

需要验证 Go 全栈预览与发布时，请先准备 Docker、运行时网络及数据库权限，再执行：

```bash
pnpm worker:build
```

生产拓扑和变量以 [Go 全栈轻应用运行时](docs/go-fullstack-runtime.md) 为准。

## 验证

```bash
# 静态检查
pnpm lint
pnpm build

# 应用契约、Agent 产品节点、运行时与发布相关测试
pnpm test:app-runtime

# 启动独立 PostgreSQL 与 Go 应用容器，执行真实 API 场景
pnpm test:fullstack-e2e
```

黄金案例的浏览器 E2E 与 UI 验收仍属于产品化阶段的必做项，不能用 API 测试代替。

## 目录结构

```text
antd-component-generator/
├── app/                    # Next.js 页面、API 和项目路由
├── components/
│   ├── chat/               # 对话、进度和结构化消息
│   ├── canvas/             # 预览、代码、版本与发布工具栏
│   └── ui/                 # 基础 UI 组件
├── hooks/                  # Chat、Canvas、Sandbox 等客户端逻辑
├── lib/
│   ├── agent/              # LangGraph 与产品节点
│   ├── build-jobs/         # 构建 / 发布 Worker
│   ├── go-runtime/         # Go 应用生成、验证与构建
│   └── data-gateway/       # 历史协议与可复用 Schema 能力
├── prisma/                 # 平台数据库模型与迁移
├── test/                   # 单元测试、fixture 与全栈 E2E
└── docs/                   # 产品、架构、部署和演示文档
```

## 产品迭代顺序

### P0：稳定演示闭环

- 首页定位、案例入口和统一视觉语言。
- 单一主工作区：计划、预览、修改、版本和发布。
- 用户可理解的 Agent 进度与失败恢复。
- 黄金案例固定数据、验收脚本和浏览器 E2E。
- 发布成功页与无登录访问验证。

### P1：提高目标页面命中率

- 可视化 Brief 与设计预设。
- 预览内选择组件并局部修改。
- 版本 Diff、Checkpoint 和一键撤销。
- 参考图输入、响应式与关键 UI 状态验收。

### P2：形成可持续使用的产品

- 项目首页、案例 Gallery 和首次引导。
- 发布中心、访问状态、错误信息和基础使用指标。
- 企业组件库、内部 API 与私有化配置。
- 基于真实反馈持续评估生成质量。

优先级的判断标准只有一个：它是否提高了用户得到目标页面、完成修改、成功发布和让他人真实使用的概率。

## 相关文档

- [产品目标与成熟度标准](docs/product-goals.md)
- [目标案例与验收条件](docs/demo-cases.md)
- [Go 全栈轻应用运行时](docs/go-fullstack-runtime.md)
- [项目发布实现](docs/project-publishing-implementation.md)
- [Agent UI 架构](docs/codex-style-agent-ui-architecture.md)
- [安全生产部署](docs/safe-production-deployment.md)
