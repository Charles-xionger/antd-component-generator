import "dotenv/config";

import { START, END, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateAnnotations } from "./state";
import { businessAnalyst, directResponder, intentRouter, solutionArchitect } from "./product-nodes";
import { workspaceQueue } from "./workspace-node";
import type { AgentState } from "./state";

let postgresCheckpointerPromise: Promise<PostgresSaver> | undefined;

function getPostgresCheckpointer() {
  if (!postgresCheckpointerPromise) {
    postgresCheckpointerPromise = (async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error("DATABASE_URL is required to initialize LangGraph");
      const checkpointer = PostgresSaver.fromConnString(databaseUrl);
      await checkpointer.setup();
      return checkpointer;
    })();
  }
  return postgresCheckpointerPromise;
}

function routeIntent(state: AgentState): "businessAnalyst" | "directResponder" | "workspaceQueue" {
  if (state.resumePendingWorkspace) return "workspaceQueue";
  if (state.baseArtifactVersionId && ["MODIFY_APP", "FIX_APP"].includes(state.intentResult?.intent || "")) return "workspaceQueue";
  return ["CREATE_APP", "MODIFY_APP", "FIX_APP"].includes(state.intentResult?.intent || "") ? "businessAnalyst" : "directResponder";
}

function routeRequirement(state: AgentState): "solutionArchitect" | typeof END {
  return state.requirementSpec?.confirmed ? "solutionArchitect" : END;
}

export async function createGraph() {
  const workflow = new StateGraph(StateAnnotations)
    .addNode("intentRouter", intentRouter)
    .addNode("businessAnalyst", businessAnalyst)
    .addNode("directResponder", directResponder)
    .addNode("solutionArchitect", solutionArchitect)
    .addNode("workspaceQueue", workspaceQueue)
    .addEdge(START, "intentRouter")
    .addConditionalEdges("intentRouter", routeIntent)
    .addEdge("directResponder", END)
    .addConditionalEdges("businessAnalyst", routeRequirement)
    .addEdge("solutionArchitect", "workspaceQueue")
    .addEdge("workspaceQueue", END);
  return workflow.compile({ checkpointer: await getPostgresCheckpointer() });
}

export type AgentGraph = Awaited<ReturnType<typeof createGraph>>;
