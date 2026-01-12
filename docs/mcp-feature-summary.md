# MCP 功能完整文档

## 📋 功能概述

MCP (Model Context Protocol) 是一个**外部工具扩展系统**，允许 AI Agent 调用外部服务器提供的工具来增强功能（如绘图、天气查询、文件操作等）。通过配置化的方式，用户可以灵活地添加、切换和管理不同的 MCP 服务器。

---

## 🏗️ 核心组件

### 1. 数据库模型

**文件位置**: `prisma/schema.prisma`

```prisma
model MCPConfig {
  id          String   @id @default(uuid())
  name        String   // MCP 名称（如 drawing、weather）
  url         String   // MCP 服务地址
  description String?  // 描述
  enabled     Boolean  @default(true) // 是否启用
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**字段说明**:

- `id`: 唯一标识符
- `name`: 配置名称，用于界面显示
- `url`: MCP 服务器的 HTTP/SSE 端点地址
- `description`: 可选的描述信息
- `enabled`: 是否启用该配置（预留字段）
- `createdAt/updatedAt`: 时间戳

---

### 2. 后端 API

#### 配置列表接口

**文件位置**: `app/api/mcp/configs/route.ts`

```typescript
// GET /api/mcp/configs
// 获取所有 MCP 配置列表
export async function GET() {
  const configs = await prisma.mCPConfig.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ configs });
}

// POST /api/mcp/configs
// 创建新的 MCP 配置
export async function POST(request: NextRequest) {
  const { name, url, description, enabled } = await request.json();
  const config = await prisma.mCPConfig.create({
    data: { name, url, description, enabled: enabled ?? true },
  });
  return Response.json({ config });
}
```

#### 单个配置操作接口

**文件位置**: `app/api/mcp/configs/[id]/route.ts`

```typescript
// GET /api/mcp/configs/:id - 获取单个配置
// PATCH /api/mcp/configs/:id - 更新配置
// DELETE /api/mcp/configs/:id - 删除配置
```

**API 接口汇总**:

| 方法   | 路径                   | 功能         |
| ------ | ---------------------- | ------------ |
| GET    | `/api/mcp/configs`     | 获取所有配置 |
| POST   | `/api/mcp/configs`     | 创建新配置   |
| GET    | `/api/mcp/configs/:id` | 获取指定配置 |
| PATCH  | `/api/mcp/configs/:id` | 更新配置     |
| DELETE | `/api/mcp/configs/:id` | 删除配置     |

---

### 3. 前端管理界面

**文件位置**: `components/mcp/config-panel.tsx`

**核心功能**:

1. **下拉选择器**

   - 显示当前选中的 MCP 配置
   - 支持选择"不使用 MCP"
   - 点击展开配置管理面板

2. **配置列表**

   - 展示所有已保存的 MCP 配置
   - 高亮显示当前选中项
   - 鼠标悬停显示编辑/删除按钮

3. **添加/编辑表单**

   - 名称输入框
   - URL 输入框（如: `http://localhost:3001/sse`）
   - 描述输入框（可选）
   - 保存/取消按钮

4. **UI 交互**
   - 展开/收起动画
   - 加载状态提示
   - 删除确认对话框

**组件接口**:

```typescript
interface MCPConfigPanelProps {
  configs: MCPConfig[]; // 配置列表
  selectedId: string | null; // 当前选中的配置 ID
  isLoading: boolean; // 加载状态
  onSelect: (id: string | null) => void; // 选择回调
  onRefresh: () => void; // 刷新列表回调
}
```

---

### 4. LangGraph Agent 集成

**文件位置**: `lib/agent/index.ts`

#### MCP 子图创建

```typescript
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

async function createMcpSubgraph(mcpUrl?: string) {
  // 1. 无 URL 时返回简单对话模式
  if (!mcpUrl) {
    return createSimpleChatSubgraph();
  }

  // 2. 连接 MCP 服务器
  const client = new MultiServerMCPClient({
    mcpServer: {
      transport: "http",
      url: mcpUrl,
    },
  });

  // 3. 获取工具列表
  const mcpTools = await client.getTools();
  console.log(`成功加载 ${mcpTools.length} 个 MCP 工具`);

  // 4. 创建 ToolNode
  const toolNode = new ToolNode(mcpTools);

  // 5. 绑定工具到 LLM
  const llmWithTools = model.bindTools(mcpTools);

  // 6. 构建 StateGraph
  const workflow = new StateGraph(McpStateAnnotations)
    .addNode("llmNode", llmNode)
    .addNode("tools", toolNode)
    .addEdge(START, "llmNode")
    .addConditionalEdges("llmNode", shouldContinue, {
      tools: "tools",
      end: "__end__",
    })
    .addEdge("tools", "llmNode");

  return workflow.compile();
}
```

#### 工作流程图

```
用户消息
    ↓
llmNode (判断是否需要工具)
    ↓
有 tool_calls?
    ├─ 是 → tools (执行工具)
    │         ↓
    │      llmNode (处理结果)
    │         ↓
    │     继续循环...
    │
    └─ 否 → __end__ (返回响应)
```

---

## 🔄 完整工作流程

### 用户视角

```
1. 用户打开聊天界面
   ↓
2. 点击 MCP 选择器，选择一个配置（如 "Drawing Server"）
   ↓
3. 发送消息："帮我画一个红色的圆形"
   ↓
4. AI 自动识别需要调用绘图工具
   ↓
5. 调用 MCP 服务器的 draw_shape 工具
   ↓
6. 返回绘图结果
   ↓
7. AI 总结并展示给用户
```

### 技术流程

```
用户输入
    ↓
[Supervisor 路由决策]
    ↓
判断请求类型: chat / coding / mcp
    ↓
[选择 MCP 子图]
    ↓
根据 selectedMcpId 获取 MCP URL
    ↓
createMcpSubgraph(mcpUrl)
    ↓
MultiServerMCPClient 连接服务器
    ↓
获取工具列表 (getTools)
    ↓
LLM 分析消息，决定调用哪个工具
    ↓
ToolNode 执行工具调用
    ↓
LLM 处理工具返回结果
    ↓
返回最终响应给用户
```

---

## 🛠️ 技术栈

| 组件           | 技术/库                 | 版本   |
| -------------- | ----------------------- | ------ |
| **数据库 ORM** | Prisma                  | ^7.2.0 |
| **数据库**     | PostgreSQL              | -      |
| **后端框架**   | Next.js App Router      | 16.1.0 |
| **AI 框架**    | LangGraph               | ^1.0.7 |
| **LangChain**  | @langchain/core         | ^1.1.7 |
| **MCP 适配器** | @langchain/mcp-adapters | ^1.1.1 |
| **LLM**        | @langchain/openai       | ^1.2.0 |
| **前端框架**   | React                   | 19.2.3 |
| **类型安全**   | TypeScript              | ^5     |

---

## 📦 关键依赖

```json
{
  "@langchain/core": "^1.1.7",
  "@langchain/langgraph": "^1.0.7",
  "@langchain/mcp-adapters": "^1.1.1",
  "@langchain/openai": "^1.2.0",
  "@prisma/client": "^7.2.0"
}
```

---

## 🚀 实现要点

### 1. 动态工具加载

```typescript
// 在聊天组件中传递 MCP 配置 ID
const chat = useChat({
  threadId,
  mcpConfigId: selectedMcpId, // 🔑 关键参数
  onArtifactDetected: (content) => {
    /* ... */
  },
});

// Agent 根据配置动态加载工具
const mcpUrl = configs.find((c) => c.id === mcpConfigId)?.url;
const mcpSubgraph = await createMcpSubgraph(mcpUrl);
```

### 2. 三子图架构

项目采用 **三层子图架构**：

1. **chat_subgraph**: 普通对话

   - 纯文本交互
   - 无工具调用

2. **coding_subgraph**: 代码生成

   - 生成前端组件
   - 创建 Artifact（文件集合）
   - 沙箱预览

3. **mcp_subgraph**: 外部工具调用
   - 连接 MCP 服务器
   - 动态获取工具列表
   - 执行工具调用

**Supervisor 路由决策逻辑**:

```typescript
const prompt = `
你需要判断用户请求属于以下哪种类型：
1. coding - 代码生成/修改
2. mcp - 外部工具调用（画图、天气等）
3. chat - 普通对话

用户消息: ${message}

请输出决策 (coding / mcp / chat):
`;
```

### 3. 降级处理

```typescript
async function createMcpSubgraph(mcpUrl?: string) {
  // 降级策略 1: 无 URL 时使用普通对话
  if (!mcpUrl) {
    return createSimpleChatSubgraph();
  }

  try {
    // 尝试连接 MCP 服务器
    const client = new MultiServerMCPClient({
      /* ... */
    });
    const mcpTools = await client.getTools();

    // 降级策略 2: 无工具时使用普通对话
    if (mcpTools.length === 0) {
      console.warn("未能加载 MCP 工具，使用普通对话模式");
      return createSimpleChatSubgraph();
    }

    return createMcpWorkflow(mcpTools);
  } catch (error) {
    // 降级策略 3: 连接失败时使用普通对话
    console.error("MCP 客户端初始化失败:", error);
    return createSimpleChatSubgraph();
  }
}
```

### 4. 错误处理

- API 请求失败提示
- MCP 服务器连接超时处理
- 工具调用异常捕获
- 用户友好的错误信息展示

---

## 📝 迁移到新项目指南

### 阶段一：环境准备

#### 1. 安装核心依赖

```bash
# AI 框架
pnpm add @langchain/core @langchain/langgraph @langchain/openai
pnpm add @langchain/mcp-adapters

# 数据库
pnpm add @prisma/client
pnpm add -D prisma

# 其他依赖
pnpm add pg dotenv zod
```

#### 2. 初始化数据库

```bash
# 初始化 Prisma
npx prisma init

# 配置 .env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
OPENAI_API_KEY="sk-..."
```

#### 3. 添加数据库模型

编辑 `prisma/schema.prisma`:

```prisma
model MCPConfig {
  id          String   @id @default(uuid())
  name        String
  url         String
  description String?
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

```bash
# 生成迁移
npx prisma migrate dev --name add_mcp_config

# 生成客户端
npx prisma generate
```

---

### 阶段二：后端实现

#### 4. 创建 API 路由

**创建文件**: `app/api/mcp/configs/route.ts`

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/database/prisma";

export async function GET() {
  try {
    const configs = await prisma.mCPConfig.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return Response.json({ configs });
  } catch (err) {
    console.error("Failed to fetch MCP configs:", err);
    return Response.json(
      { error: "Failed to fetch MCP configs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, url, description, enabled } = await request.json();
    if (!name || !url) {
      return Response.json(
        { error: "name and url are required" },
        { status: 400 }
      );
    }
    const config = await prisma.mCPConfig.create({
      data: { name, url, description, enabled: enabled ?? true },
    });
    return Response.json({ config });
  } catch (err) {
    console.error("Failed to create MCP config:", err);
    return Response.json(
      { error: "Failed to create MCP config" },
      { status: 500 }
    );
  }
}
```

**创建文件**: `app/api/mcp/configs/[id]/route.ts`

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/database/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = await prisma.mCPConfig.findUnique({ where: { id } });
  if (!config) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ config });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  const config = await prisma.mCPConfig.update({ where: { id }, data });
  return Response.json({ config });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.mCPConfig.delete({ where: { id } });
  return Response.json({ success: true });
}
```

#### 5. 集成 LangGraph Agent

**创建文件**: `lib/agent/mcp-subgraph.ts`

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { StateGraph, START, Annotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, BaseMessage } from "@langchain/core/messages";

export async function createMcpSubgraph(mcpUrl?: string) {
  const model = new ChatOpenAI({
    modelName: "gpt-4",
    temperature: 0.7,
  });

  const McpStateAnnotations = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
  });

  // 无 URL 时返回简单对话
  if (!mcpUrl) {
    const simpleNode = async (state: typeof McpStateAnnotations.State) => {
      const response = await model.invoke(state.messages);
      return { messages: [response] };
    };

    const workflow = new StateGraph(McpStateAnnotations)
      .addNode("agent", simpleNode)
      .addEdge(START, "agent");

    return workflow.compile();
  }

  // 连接 MCP 服务器
  try {
    const client = new MultiServerMCPClient({
      mcpServer: {
        transport: "http",
        url: mcpUrl,
      },
    });

    const mcpTools = await client.getTools();
    console.log(`成功加载 ${mcpTools.length} 个 MCP 工具`);

    if (mcpTools.length > 0) {
      const toolNode = new ToolNode(mcpTools);
      const llmWithTools = model.bindTools(mcpTools);

      const shouldContinue = (state: typeof McpStateAnnotations.State) => {
        const lastMessage = state.messages[
          state.messages.length - 1
        ] as AIMessage;
        return lastMessage.tool_calls && lastMessage.tool_calls.length > 0
          ? "tools"
          : "end";
      };

      const llmNode = async (state: typeof McpStateAnnotations.State) => {
        const response = await llmWithTools.invoke(state.messages);
        return { messages: [response] };
      };

      const workflow = new StateGraph(McpStateAnnotations)
        .addNode("llmNode", llmNode)
        .addNode("tools", toolNode)
        .addEdge(START, "llmNode")
        .addConditionalEdges("llmNode", shouldContinue, {
          tools: "tools",
          end: "__end__",
        })
        .addEdge("tools", "llmNode");

      return workflow.compile();
    }
  } catch (error) {
    console.error("MCP 客户端初始化失败:", error);
  }

  // 降级到普通对话
  const simpleNode = async (state: typeof McpStateAnnotations.State) => {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
  };

  const workflow = new StateGraph(McpStateAnnotations)
    .addNode("agent", simpleNode)
    .addEdge(START, "agent");

  return workflow.compile();
}
```

---

### 阶段三：前端实现

#### 6. 创建 MCP 配置面板组件

**创建文件**: `components/mcp/config-panel.tsx`

> 完整代码请参考项目源文件，主要功能包括：
>
> - 配置选择器（下拉菜单）
> - 配置列表展示
> - 添加/编辑表单
> - 删除确认

**创建文件**: `components/mcp/index.ts`

```typescript
export { MCPConfigPanel } from "./config-panel";
export type { MCPConfig } from "./config-panel";
```

#### 7. 集成到聊天界面

**修改文件**: `components/unified-chat.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { MCPConfigPanel, MCPConfig } from "@/components/mcp";

export function UnifiedChat({ threadId }: { threadId?: string }) {
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // 获取 MCP 配置列表
  const fetchMcpConfigs = async () => {
    setIsMcpLoading(true);
    try {
      const response = await fetch("/api/mcp/configs");
      if (response.ok) {
        const data = await response.json();
        setMcpConfigs(data.configs || []);
      }
    } catch (error) {
      console.error("Failed to fetch MCP configs:", error);
    } finally {
      setIsMcpLoading(false);
    }
  };

  useEffect(() => {
    fetchMcpConfigs();
  }, []);

  // 使用 MCP 配置
  const chat = useChat({
    threadId,
    mcpConfigId: selectedMcpId, // 🔑 传递选中的配置 ID
  });

  return (
    <div className="flex h-full">
      <div className="flex-1">
        {/* MCP 配置面板 */}
        <MCPConfigPanel
          configs={mcpConfigs}
          selectedId={selectedMcpId}
          isLoading={isMcpLoading}
          onSelect={setSelectedMcpId}
          onRefresh={fetchMcpConfigs}
        />

        {/* 聊天界面 */}
        {/* ... */}
      </div>
    </div>
  );
}
```

---

### 阶段四：测试

#### 8. 启动 MCP 服务器

可以使用官方示例服务器进行测试：

```bash
# 安装 MCP 服务器（以 drawing 为例）
git clone https://github.com/modelcontextprotocol/servers
cd servers/src/drawing
npm install
npm run build

# 启动服务器
npm start
# 默认运行在 http://localhost:3001/sse
```

#### 9. 添加配置并测试

1. 启动你的项目
2. 打开聊天界面
3. 点击 MCP 配置选择器 → "添加 MCP 配置"
4. 填写信息：
   - 名称: `Drawing Server`
   - URL: `http://localhost:3001/sse`
   - 描述: `绘图工具服务器`
5. 保存并选择该配置
6. 发送测试消息: "帮我画一个蓝色的正方形"
7. 观察 AI 是否正确调用工具并返回结果

---

## ⚠️ 注意事项

### 1. MCP 服务器要求

- **必须支持 HTTP/SSE 传输协议**
- 需要实现 Model Context Protocol 标准接口
- 建议提供健康检查端点

### 2. URL 格式规范

```typescript
// ✅ 正确格式
"http://localhost:3001/sse";
"https://api.example.com/mcp";

// ❌ 错误格式
"localhost:3001"; // 缺少协议
"http://localhost:3001"; // 缺少路径（视服务器而定）
```

### 3. 错误处理

- **连接超时**: 设置合理的超时时间（如 30 秒）
- **工具调用失败**: 提供降级方案或错误提示
- **服务器不可用**: 自动切换到普通对话模式

### 4. 安全性考虑

- **API 认证**: 生产环境建议添加 API Key 验证
- **权限控制**: 限制可调用的工具类型
- **输入验证**: 验证用户输入，防止注入攻击
- **速率限制**: 防止工具调用过于频繁

### 5. 性能优化

- **工具列表缓存**: 避免每次请求都重新获取
- **连接池**: 复用 MCP 客户端连接
- **异步处理**: 工具调用使用异步模式
- **超时设置**: 避免长时间等待

---

## 🎯 扩展建议

### 短期优化

1. **工具测试功能**

   - 添加"测试连接"按钮
   - 显示可用工具列表
   - 工具调用日志

2. **配置导入/导出**

   - JSON 格式导出配置
   - 批量导入配置
   - 配置模板

3. **状态监控**
   - MCP 服务器在线状态
   - 工具调用成功率
   - 响应时间统计

### 中期规划

4. **多服务器支持**

   - 同时连接多个 MCP 服务器
   - 智能选择合适的工具
   - 工具名称冲突处理

5. **权限管理**

   - 用户级别的配置隔离
   - 工具使用权限控制
   - 审计日志

6. **工具市场**
   - 预置常用 MCP 服务器配置
   - 一键安装和启用
   - 社区分享

### 长期愿景

7. **自定义工具开发**

   - 可视化工具构建器
   - 低代码创建 MCP 服务器
   - 本地工具调试

8. **智能路由优化**
   - 基于历史数据优化路由决策
   - 自动学习用户偏好
   - 多模型协同

---

## 📚 相关资源

### 官方文档

- [Model Context Protocol 规范](https://modelcontextprotocol.io/)
- [LangChain MCP Adapters](https://js.langchain.com/docs/integrations/tools/mcp)
- [LangGraph 文档](https://langchain-ai.github.io/langgraphjs/)

### 示例服务器

- [MCP Servers (官方)](https://github.com/modelcontextprotocol/servers)
- [Drawing MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/drawing)
- [Weather MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/weather)

### 社区资源

- [MCP Discord 社区](https://discord.gg/modelcontextprotocol)
- [Awesome MCP](https://github.com/modelcontextprotocol/awesome-mcp)

---

## 🔧 故障排查

### 问题 1: MCP 服务器连接失败

**症状**: 控制台显示 "MCP 客户端初始化失败"

**解决方案**:

1. 检查 MCP 服务器是否正在运行
2. 验证 URL 格式是否正确
3. 检查网络连接和防火墙设置
4. 查看服务器日志排查错误

### 问题 2: 工具列表为空

**症状**: 成功连接但无工具可用

**解决方案**:

1. 确认 MCP 服务器正确实现了 `tools/list` 接口
2. 检查服务器返回的工具格式是否符合规范
3. 查看是否有权限限制

### 问题 3: 工具调用无响应

**症状**: AI 尝试调用工具但没有结果

**解决方案**:

1. 检查工具参数格式是否正确
2. 查看服务器端日志
3. 增加超时时间设置
4. 确认工具实现是否有 bug

### 问题 4: 路由决策错误

**症状**: AI 选择了错误的子图

**解决方案**:

1. 优化 Supervisor Prompt
2. 增加更多上下文信息
3. 调整路由决策的 temperature 参数
4. 使用更强的模型进行路由

---

## 📊 最佳实践

### 1. 配置管理

```typescript
// ✅ 推荐：集中管理配置
const MCP_CONFIGS = {
  DRAWING: {
    name: "Drawing Tools",
    url: process.env.MCP_DRAWING_URL || "http://localhost:3001/sse",
  },
  WEATHER: {
    name: "Weather Service",
    url: process.env.MCP_WEATHER_URL || "http://localhost:3002/sse",
  },
};
```

### 2. 错误处理

```typescript
// ✅ 推荐：详细的错误日志
try {
  const tools = await client.getTools();
} catch (error) {
  console.error("MCP 工具获取失败:", {
    url: mcpUrl,
    error: error.message,
    stack: error.stack,
  });
  // 发送告警或记录到监控系统
}
```

### 3. 用户体验

```typescript
// ✅ 推荐：提供清晰的状态反馈
if (isConnecting) {
  return <LoadingSpinner message="正在连接 MCP 服务器..." />;
}

if (connectionError) {
  return (
    <ErrorMessage
      title="连接失败"
      message={connectionError}
      retry={handleRetry}
    />
  );
}
```

---

## 📝 总结

MCP 功能通过以下关键特性实现了 AI Agent 的能力扩展：

✅ **配置化管理**: 通过数据库存储和 UI 配置，用户可以灵活管理多个 MCP 服务器

✅ **动态工具加载**: 运行时动态获取和绑定工具，无需重启服务

✅ **智能路由**: Supervisor 自动识别用户意图，选择合适的子图处理

✅ **降级处理**: 多层降级策略确保系统稳定性

✅ **类型安全**: TypeScript + Zod 保证类型安全

✅ **可扩展**: 模块化设计便于添加新功能

这个架构设计优雅、可维护性强，非常适合作为基础框架移植到其他 AI 应用项目中！

---

**文档版本**: v1.0.0  
**最后更新**: 2026 年 1 月 12 日  
**维护者**: GitHub Copilot
