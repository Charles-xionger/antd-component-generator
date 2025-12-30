import "dotenv/config";

import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { Annotation, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateAnnotations, type AgentState } from "./state";
import { architect, coder } from "./nodes";

// 创建 checkpointer 并初始化
const postgresCheckpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
);

// 初始化数据库表
await postgresCheckpointer.setup();

// 创建编程 subgraph (Architect → Coder)
function createCodingSubgraph() {
  const codingWorkflow = new StateGraph(StateAnnotations)
    .addNode("architect", architect)
    .addNode("coder", coder)
    .addEdge(START, "architect")
    .addEdge("architect", "coder");

  return codingWorkflow.compile();
}

// 创建主图 (只保留 coding 子图)
export async function createGraphForMcpUrl(
  codeContext?: string,
  _mcpUrl?: string // 保留参数签名以防外部调用报错
) {
  const codingSubgraph = createCodingSubgraph();

  // 创建主 graph，直接路由到 coding_subgraph
  const workflow = new StateGraph(StateAnnotations)
    .addNode("coding_subgraph", async (state: AgentState) => {
      // 注入代码上下文到编程子图
      const stateWithContext = {
        ...state,
        codeContext: codeContext || state.codeContext,
      };
      const result = await codingSubgraph.invoke(stateWithContext);

      // 只返回新消息和其他状态更新
      const newMessages = result.messages?.slice(state.messages.length) || [];
      return {
        ...result,
        messages: newMessages,
      };
    })
    .addEdge(START, "coding_subgraph");

  const graph = workflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraphForMcpUrl>>;
