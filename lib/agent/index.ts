import "dotenv/config";

import { AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  Annotation,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";

// 创建 checkpointer 并初始化
const postgresCheckpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
);

// 初始化数据库表（只需执行一次，会自动创建 checkpoints 等表）
await postgresCheckpointer.setup();

const StateAnnotations = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

const baseModelConfig = {
  model: process.env.NEXT_PUBLIC_ALIYUN_MODEL_NAME,
  temperature: 0.7,
  apiKey: process.env.ALIYUN_API_KEY,
  configuration: {
    baseURL: process.env.ALIYUN_BASE_URL,
  },
};

async function getToolsFromMcpUrl(mcpUrl?: string) {
  if (!mcpUrl) return [] as StructuredToolInterface[];
  try {
    const client = new MultiServerMCPClient({
      remote: {
        transport: "http",
        url: mcpUrl,
      },
    });
    const mcpTools = await client.getTools();
    return mcpTools as StructuredToolInterface[];
  } catch (err) {
    console.error("Failed to fetch tools from MCP:", err);
    return [] as StructuredToolInterface[];
  }
}

// 创建一个带有可选 MCP tools 的 graph
export async function createGraphForMcpUrl(mcpUrl?: string) {
  const tools = await getToolsFromMcpUrl(mcpUrl);

  const model = new ChatOpenAI(baseModelConfig);
  const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;

  const toolNode = new ToolNode(tools);

  const shouldContinue = (state: typeof StateAnnotations.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    return lastMessage.tool_calls && lastMessage.tool_calls.length > 0
      ? "tools"
      : "__end__";
  };

  const agentNode = async (state: typeof StateAnnotations.State) => {
    const response = await modelWithTools.invoke(state.messages);
    return {
      messages: [response],
    };
  };

  const workflow = new StateGraph(StateAnnotations)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      __end__: "__end__",
    })
    .addEdge("tools", "agent");

  const graph = workflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraphForMcpUrl>>;
