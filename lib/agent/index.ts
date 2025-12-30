import "dotenv/config";

import { START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateAnnotations } from "./state";
import { architect, coder } from "./nodes";

// 创建 checkpointer 并初始化
const postgresCheckpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
);

// 初始化数据库表
await postgresCheckpointer.setup();

/**
 * 创建主图 (Architect → Coder)
 */
export async function createGraph() {
  const workflow = new StateGraph(StateAnnotations)
    .addNode("architect", architect)
    .addNode("coder", coder)
    .addEdge(START, "architect")
    .addEdge("architect", "coder");

  const graph = workflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraph>>;
