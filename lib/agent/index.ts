import "dotenv/config";

import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

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
    const response = await model.invoke(state.messages);
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

// 主 supervisor 路由逻辑
async function routeToSubgraph(state: AgentState): Promise<string> {
  const llm = new ChatOpenAI({
    ...baseModelConfig,
    temperature: 0.1, // 路由决策需要确定性
  });

  const lastMessage = state.messages[state.messages.length - 1];
  const userMessage = lastMessage?.content || "";

  const prompt = SUPERVISOR_PROMPT.replace("{message}", String(userMessage));

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const decision = response.content.toString().trim().toLowerCase();

  console.log("Supervisor routing decision:", decision);

  // 返回子图名称
  if (decision.includes("coding")) {
    return "coding_subgraph";
  } else {
    return "chat_subgraph";
  }
}

// 创建主图 (禁用 MCP 功能)
export async function createGraphForMcpUrl(codeContext?: string) {
  // 创建子图
  const chatSubgraph = createChatSubgraph();
  const codingSubgraph = createCodingSubgraph();

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
    .addConditionalEdges(START, routeToSubgraph, {
      chat_subgraph: "chat_subgraph",
      coding_subgraph: "coding_subgraph",
    });

  const graph = supervisorWorkflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraphForMcpUrl>>;
