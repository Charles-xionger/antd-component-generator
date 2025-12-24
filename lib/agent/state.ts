// lib/agent/state.ts
import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export interface AgentPlan {
  files: Array<{ path: string; description: string }>;
  dependencies: string[];
  architecture_notes: string;
}

export interface AgentState {
  // 消息历史
  messages: BaseMessage[];
  // 架构师生成的蓝图
  plan?: AgentPlan;
  // 当前生成的代码片段 (XML)
  generatedArtifact?: string;
  // 审查反馈
  reviewFeedback?: string;
  // 迭代计数 (防止死循环)
  iterationCount: number;
  // 当前代码上下文（用于向 Agent 注入已有代码）
  codeContext?: string;
}

// LangGraph state annotation
export const StateAnnotations = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => {
      // 如果 y 是空数组，返回 x
      if (!y || y.length === 0) return x;

      // 避免重复消息：只添加新的消息
      const existingIds = new Set(x.map((msg) => msg.id).filter(Boolean));
      const newMessages = y.filter(
        (msg) => !msg.id || !existingIds.has(msg.id)
      );

      return x.concat(newMessages);
    },
    default: () => [],
  }),
  plan: Annotation<AgentPlan | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  generatedArtifact: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  reviewFeedback: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  iterationCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  codeContext: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});
