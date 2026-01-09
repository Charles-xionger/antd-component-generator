import "dotenv/config";

import { START, END, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateAnnotations } from "./state";
import { architect, coder } from "./nodes";
import type { AgentState } from "./state";

// 创建 checkpointer 并初始化
const postgresCheckpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
);

// 初始化数据库表
await postgresCheckpointer.setup();

/**
 * 条件路由：判断 Architect 是否生成了架构方案
 * - 如果有 <architectPlan>，路由到 coder
 * - 否则直接结束（闲聊、拒绝等情况）
 */
function shouldContinueToCoder(state: AgentState): "coder" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage) {
    console.log("[Router] 没有消息，直接结束");
    return END;
  }

  const content =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : Array.isArray(lastMessage.content)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastMessage.content.map((c: any) => c.text || "").join("")
      : "";

  const hasArchitectPlan = content.includes("<architectPlan");

  console.log("[Router] 路由决策:", {
    messageType: lastMessage._getType(),
    hasArchitectPlan,
    contentLength: content.length,
    decision: hasArchitectPlan ? "coder" : "END",
  });

  return hasArchitectPlan ? "coder" : END;
}

/**
 * 创建主图 (Architect → 条件路由 → Coder/END)
 */
export async function createGraph() {
  const workflow = new StateGraph(StateAnnotations)
    .addNode("architect", architect)
    .addNode("coder", coder)
    .addEdge(START, "architect")
    .addConditionalEdges("architect", shouldContinueToCoder)
    .addEdge("coder", END);

  const graph = workflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraph>>;
