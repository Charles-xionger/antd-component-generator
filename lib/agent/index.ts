import "dotenv/config";

import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { Annotation, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

// Import our new multi-agent components
import { StateAnnotations, type AgentState } from "./state";
import {
  architect,
  coder,
  reviewer,
  shouldContinueToReviewer,
  shouldRetryOrFinish,
} from "./nodes";
import { SUPERVISOR_PROMPT } from "./prompts";
import { StructuredToolInterface } from "@langchain/core/tools";

// 定义路由响应的结构化输出（关键优化！）
const RouteSchema = z.object({
  next: z
    .enum(["coding_subgraph", "mcp_subgraph", "chat_subgraph"])
    .describe("下一个要路由到的子图名称"),
  reasoning: z.string().optional().describe("路由决策的理由（可选）"),
});

// 创建 checkpointer 并初始化
const postgresCheckpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
);

// 初始化数据库表（只需执行一次，会自动创建 checkpoints 等表）
await postgresCheckpointer.setup();

const baseModelConfig = {
  model: process.env.NEXT_PUBLIC_ALIYUN_MODEL_NAME || "qwen-plus",
  temperature: 0.7,
  apiKey: process.env.ALIYUN_API_KEY,
  configuration: {
    baseURL:
      process.env.ALIYUN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // 添加更宽松的 SSL 配置来解决连接问题
    httpAgent: undefined,
    httpsAgent: undefined,
  },
  // 添加重试配置
  maxRetries: 3,
  timeout: 30000, // 30秒超时
};

/**
 * 清理消息历史，移除不完整的 tool calls
 * OpenAI 兼容 API 要求：带有 tool_calls 的 assistant 消息后必须跟着对应的 tool 响应消息
 */
function sanitizeMessages(messages: BaseMessage[]): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgType = msg._getType();

    // 检查是否是带 tool_calls 的 AI 消息
    if (msgType === "ai") {
      const aiMsg = msg as AIMessage;
      const toolCalls = aiMsg.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // 检查后续是否有对应的 tool 响应消息
        const toolCallIds = new Set(toolCalls.map((tc) => tc.id));
        let hasAllResponses = true;
        let nextIdx = i + 1;

        // 查找后续的 tool 消息
        while (
          nextIdx < messages.length &&
          messages[nextIdx]._getType() === "tool"
        ) {
          const toolMsg = messages[nextIdx] as unknown as {
            tool_call_id?: string;
          };
          if (toolMsg.tool_call_id) {
            toolCallIds.delete(toolMsg.tool_call_id);
          }
          nextIdx++;
        }

        // 如果还有未响应的 tool_call_id，说明不完整
        if (toolCallIds.size > 0) {
          console.log("跳过不完整的 tool call 消息:", Array.from(toolCallIds));
          hasAllResponses = false;
        }

        if (!hasAllResponses) {
          // 跳过这条 AI 消息和后续的不完整 tool 消息
          continue;
        }
      }
    }

    // 跳过孤立的 tool 消息（没有对应的 AI 消息）
    if (msgType === "tool") {
      // 检查前一条是否是带 tool_calls 的 AI 消息
      if (result.length === 0) {
        continue;
      }
      const prevMsg = result[result.length - 1];
      if (prevMsg._getType() !== "ai") {
        continue;
      }
    }

    result.push(msg);
  }

  return result;
}

// 创建简单对话 subgraph (无 MCP 功能)
function createChatSubgraph() {
  const model = new ChatOpenAI(baseModelConfig);

  // 简化状态定义，只包含 messages
  const ChatStateAnnotations = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
  });

  const agentNode = async (state: typeof ChatStateAnnotations.State) => {
    // 清理消息，移除不完整的 tool calls
    const cleanMessages = sanitizeMessages(state.messages);
    const response = await model.invoke(cleanMessages);
    return { messages: [response] };
  };

  const chatWorkflow = new StateGraph(ChatStateAnnotations)
    .addNode("agent", agentNode)
    .addEdge(START, "agent");

  return chatWorkflow.compile();
}

// 创建编程 subgraph (新的多智能体系统)
function createCodingSubgraph() {
  const codingWorkflow = new StateGraph(StateAnnotations)
    .addNode("architect", architect)
    .addNode("coder", coder)
    .addNode("reviewer", reviewer)
    .addEdge(START, "architect")
    .addEdge("architect", "coder")
    .addConditionalEdges("coder", shouldContinueToReviewer, {
      reviewer: "reviewer",
      end: "__end__",
    })
    .addConditionalEdges("reviewer", shouldRetryOrFinish, {
      coder: "coder",
      end: "__end__",
    });

  return codingWorkflow.compile();
}

// 创建 MCP subgraph (使用官方 @langchain/mcp-adapters)
async function createMcpSubgraph(mcpUrl?: string) {
  const model = new ChatOpenAI(baseModelConfig);

  // MCP 状态定义
  const McpStateAnnotations = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
  });

  // 如果没有提供 mcpUrl，返回简单的对话模式
  if (!mcpUrl) {
    const simpleNode = async (state: typeof McpStateAnnotations.State) => {
      const cleanMessages = sanitizeMessages(state.messages);
      const response = await model.invoke(cleanMessages);
      return { messages: [response] };
    };

    const workflow = new StateGraph(McpStateAnnotations)
      .addNode("agent", simpleNode)
      .addEdge(START, "agent");

    return workflow.compile();
  }

  // 使用官方 MCP 客户端
  console.log("初始化 MCP 客户端，服务器:", mcpUrl);

  let mcpTools: StructuredToolInterface[] = [];
  let toolNode: ToolNode | null = null;

  try {
    // 使用 MultiServerMCPClient 连接 MCP 服务器
    const client = new MultiServerMCPClient({
      mcpServer: {
        transport: "http",
        url: mcpUrl,
      },
    });

    // 获取工具列表
    mcpTools = await client.getTools();
    console.log(
      `成功加载 ${mcpTools.length} 个 MCP 工具:`,
      mcpTools.map((t) => t.name).join(", ")
    );

    // 创建 ToolNode
    if (mcpTools.length > 0) {
      toolNode = new ToolNode(mcpTools);
    }
  } catch (error) {
    console.error("MCP 客户端初始化失败:", error);
    // 继续执行，但不使用工具
  }

  // 如果成功获取了工具，创建带工具的 agent
  if (mcpTools.length > 0 && toolNode) {
    const llmWithTools = model.bindTools(mcpTools);

    // 判断是否需要调用工具
    const shouldContinue = (state: typeof McpStateAnnotations.State) => {
      const lastMessage = state.messages[
        state.messages.length - 1
      ] as AIMessage;
      return lastMessage.tool_calls && lastMessage.tool_calls.length > 0
        ? "tools"
        : "end";
    };

    // LLM 节点
    const llmNode = async (state: typeof McpStateAnnotations.State) => {
      const cleanMessages = sanitizeMessages(state.messages);
      const response = await llmWithTools.invoke(cleanMessages);
      return { messages: [response] };
    };

    // 构建带工具的图
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
  } else {
    // 回退到普通对话模式
    console.warn("未能加载 MCP 工具，使用普通对话模式");
    const simpleNode = async (state: typeof McpStateAnnotations.State) => {
      const cleanMessages = sanitizeMessages(state.messages);
      const response = await model.invoke(cleanMessages);
      return { messages: [response] };
    };

    const workflow = new StateGraph(McpStateAnnotations)
      .addNode("agent", simpleNode)
      .addEdge(START, "agent");

    return workflow.compile();
  }
}

// 主 supervisor 路由逻辑（优化版：使用结构化输出）
async function routeToSubgraph(state: AgentState): Promise<string> {
  const lastMessage = state.messages[state.messages.length - 1];

  try {
    // 使用强模型 + temperature=0 确保决策准确性
    // 注意：这里创建独立的 LLM 实例，不会影响主对话流
    const llm = new ChatOpenAI({
      ...baseModelConfig,
      temperature: 0, // 路由决策需要确定性
      streaming: false, // 关键：禁用流式输出，避免 JSON 泄漏到前端
    });

    const prompt = SUPERVISOR_PROMPT.replace(
      "{message}",
      String(lastMessage?.content || "")
    );

    // 关键优化：使用 withStructuredOutput 强制输出符合 RouteSchema 的结果
    // 注意：直接 invoke 不会添加到消息历史，因为这只是内部路由决策
    const structuredLlm = llm.withStructuredOutput(RouteSchema);

    // 只传递系统提示和用户消息，不传递完整历史，避免路由决策被保存
    const response = await structuredLlm.invoke([new HumanMessage(prompt)]);

    console.log(
      "路由决策:",
      response.next,
      response.reasoning ? `(${response.reasoning})` : ""
    );

    return response.next;
  } catch (error) {
    console.error("路由失败，默认 chat:", error);
    return "chat_subgraph";
  }
}

// 创建主图 (支持三个子图：chat、coding、mcp)
export async function createGraphForMcpUrl(
  codeContext?: string,
  mcpUrl?: string
) {
  // 创建子图（MCP subgraph 现在是异步的）
  const chatSubgraph = createChatSubgraph();
  const codingSubgraph = createCodingSubgraph();
  const mcpSubgraph = await createMcpSubgraph(mcpUrl);

  // 创建主 supervisor graph
  const supervisorWorkflow = new StateGraph(StateAnnotations)
    .addNode("chat_subgraph", async (state: AgentState) => {
      // 将状态转换为 chat 子图格式
      const result = await chatSubgraph.invoke({
        messages: state.messages,
      });
      // 只返回新消息，而不是完整历史
      const newMessages = result.messages.slice(state.messages.length);
      return {
        messages: newMessages,
      };
    })
    .addNode("coding_subgraph", async (state: AgentState) => {
      // 注入代码上下文到编程子图
      const stateWithContext = {
        ...state,
        codeContext: codeContext || state.codeContext,
      };
      const result = await codingSubgraph.invoke(stateWithContext);

      // 只返回新消息和其他状态更新，避免重复消息历史
      const newMessages = result.messages?.slice(state.messages.length) || [];
      return {
        ...result,
        messages: newMessages,
      };
    })
    .addNode("mcp_subgraph", async (state: AgentState) => {
      // MCP 工具调用子图
      const result = await mcpSubgraph.invoke({
        messages: state.messages,
      });
      // 只返回新消息
      const newMessages = result.messages.slice(state.messages.length);
      return {
        messages: newMessages,
      };
    })
    .addConditionalEdges(START, routeToSubgraph, {
      chat_subgraph: "chat_subgraph",
      coding_subgraph: "coding_subgraph",
      mcp_subgraph: "mcp_subgraph",
    });

  const graph = supervisorWorkflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraphForMcpUrl>>;
