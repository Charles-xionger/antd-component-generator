// lib/agent/nodes.ts
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { AgentState, AgentPlan } from "./state";
import { ARCHITECT_PROMPT, CODER_PROMPT } from "./prompts";

const baseModelConfig = {
  model: process.env.NEXT_PUBLIC_MODEL_NAME || "qwen-plus",
  temperature: 0.7,
  apiKey: process.env.AI302_API_KEY,
  configuration: {
    baseURL: process.env.AI302_BASE_URL || "https://api.302.ai/v1",
    // 添加更宽松的 SSL 配置来解决连接问题
    httpAgent: undefined,
    httpsAgent: undefined,
  },
  // 添加重试配置
  maxRetries: 3,
  timeout: 30000, // 30秒超时
};

// Architect Node: 生成开发计划
export async function architect(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log("🚀 ~ architect ~ state:", state);
  const llm = new ChatOpenAI({
    ...baseModelConfig,
    temperature: 0.3, // 更低的温度确保结构化输出
  });

  const lastUserMessage = state.messages
    .filter((m) => m._getType() === "human")
    .slice(-1)[0];

  // 提取用户消息内容（支持字符串或多模态数组）
  const extractMessageContent = lastUserMessage.content;
  console.log("🚀 ~ architect ~ extractMessageContent:", extractMessageContent);

  // 注入代码上下文到 architect prompt
  // 如果 state.codeContext 不为空则进行替换，否则使用默认提示

  const promptWithContext = ARCHITECT_PROMPT.replace(
    "{codeContext}",
    state.codeContext || ""
  );

  // 构建消息内容（文本 + 图片）
  const messages = [
    new SystemMessage(promptWithContext),
    new HumanMessage({ content: extractMessageContent }),
  ];

  try {
    const response = await llm.invoke(messages);

    // 直接返回完整响应，不再解析和构建 plan 对象
    // Coder 会直接使用完整的 architect 消息内容（包含开场白、<architectPlan>、结束语）
    return {
      messages: [response],
    };
  } catch (err) {
    return {
      messages: [
        new AIMessage(err instanceof Error ? err.message : "Unknown error"),
      ],
    };
  }
}

// Coder Node: 生成代码
export async function coder(state: AgentState): Promise<Partial<AgentState>> {
  const llm = new ChatOpenAI({
    ...baseModelConfig,
    temperature: 0.1, // 代码生成需要更确定性的输出
  });

  // 准备 prompt，注入代码上下文
  const promptWithContext = CODER_PROMPT.replace(
    "{codeContext}",
    state.codeContext || "这是一个新项目，没有现有代码。"
  );

  // 找到上一个 coder 消息的位置（包含 <boltArtifact> 的 AI 消息）
  let lastCoderIndex = -1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (
      msg._getType() === "ai" &&
      msg.content.toString().includes("<boltArtifact")
    ) {
      lastCoderIndex = i;
      break;
    }
  }

  // 获取相关的对话上下文
  let relevantMessages: typeof state.messages;

  if (lastCoderIndex === -1) {
    // 第一次生成代码：获取所有消息（包括第一条用户消息和所有 architect）
    relevantMessages = state.messages;
  } else {
    // 不是第一次：只获取上一个 coder 之后的消息
    relevantMessages = state.messages.slice(lastCoderIndex + 1);
  }

  // 确保包含第一条用户消息（含图片），作为视觉参考
  const firstUserMessage = state.messages.find((m) => m._getType() === "human");
  const hasFirstUserInRelevant = relevantMessages.some(
    (m) => m === firstUserMessage
  );

  // 构建消息列表
  const messages = [
    new SystemMessage(promptWithContext),
    // 如果相关消息中没有第一条用户消息，添加它（提供图片等视觉参考）
    ...(hasFirstUserInRelevant
      ? []
      : firstUserMessage
      ? [firstUserMessage]
      : []),
    ...relevantMessages, // 上一个 coder 之后的所有用户消息和 architect 消息
  ];

  console.log("[Coder] 上下文消息数量:", {
    total: messages.length,
    lastCoderIndex,
    relevantMessagesCount: relevantMessages.length,
    includesFirstUserMessage: !!firstUserMessage,
  });

  try {
    const response = await llm.invoke(messages);

    return {
      messages: [response], // 只返回新的AI消息
      generatedArtifact: response.content.toString(),
    };
  } catch (networkError) {
    console.error("Network error in coder:", networkError);
    // 网络错误时返回错误消息
    return {
      messages: [new AIMessage("网络连接错误，无法生成代码")], // 只返回新的错误消息
      generatedArtifact: "网络连接错误，请检查网络设置后重试。",
    };
  }
}
