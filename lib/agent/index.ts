import "dotenv/config";

import { START, END, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateAnnotations } from "./state";
import { sceneDetector, architect, coder } from "./nodes";
import type { AgentState } from "./state";

// 延迟初始化 checkpointer，避免在 Next.js 构建期间连接数据库。
let postgresCheckpointerPromise: Promise<PostgresSaver> | undefined;

function getPostgresCheckpointer() {
  if (!postgresCheckpointerPromise) {
    postgresCheckpointerPromise = (async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required to initialize LangGraph");
      }

      const checkpointer = PostgresSaver.fromConnString(databaseUrl);
      await checkpointer.setup();
      return checkpointer;
    })();
  }

  return postgresCheckpointerPromise;
}

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
 * 创建主图 (SceneDetector → Architect → 条件路由 → Coder/END)
 */
export async function createGraph() {
  const postgresCheckpointer = await getPostgresCheckpointer();
  const workflow = new StateGraph(StateAnnotations)
    .addNode("sceneDetector", sceneDetector)
    .addNode("architect", architect)
    .addNode("coder", coder)
    .addEdge(START, "sceneDetector")
    .addEdge("sceneDetector", "architect")
    .addConditionalEdges("architect", shouldContinueToCoder)
    .addEdge("coder", END);

  const graph = workflow.compile({
    checkpointer: postgresCheckpointer,
  });

  return graph;
}

export type AgentGraph = Awaited<ReturnType<typeof createGraph>>;
