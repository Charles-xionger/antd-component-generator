// lib/agent/state.ts
import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export interface AgentPlan {
  files: Array<{ path: string; description: string }>;
  dependencies: string[];
  architecture_notes: string;
}

export type SceneType = "new" | "bug-fix" | "modify" | "unknown";

export interface AgentState {
  // 消息历史
  messages: BaseMessage[];
  // 架构师生成的蓝图
  plan?: AgentPlan;
  // 当前生成的代码片段 (XML)
  generatedArtifact?: string;
  // 当前代码上下文（用于向 Agent 注入已有代码）
  codeContext?: string;
  // 场景类型（由 sceneDetector 节点判断）
  sceneType?: SceneType;
}

// LangGraph state annotation
export const StateAnnotations = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => {
      // 特殊处理：如果 y 的第一个元素有 __replace__ 标记，则直接替换
      // 这用于删除消息等需要完全替换消息列表的场景
      if (
        y &&
        y.length > 0 &&
        typeof y[0] === "object" &&
        y[0] !== null &&
        "__replace__" in y[0]
      ) {
        // 移除标记并返回实际消息列表
        return y.slice(1);
      }

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
  codeContext: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  sceneType: Annotation<SceneType | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});
