// lib/agent/nodes.ts
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "./state";
import { ARCHITECT_PROMPT, CODER_PROMPT } from "./prompts";
import { createLLM } from "./models";

/**
 * 压缩 prompt 以节省 token
 * - 删除连续的空行（保留单个换行）
 * - 删除行首尾空格
 * - 压缩多个连续空格为单个空格
 */
function compressPrompt(prompt: string): string {
  return prompt
    .split("\n")
    .map((line) => line.trim()) // 删除每行首尾空格
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // 连续3个以上换行压缩为2个
    .replace(/ {2,}/g, " "); // 连续多个空格压缩为1个
}

// Architect Node: 生成开发计划
export async function architect(
  state: AgentState,
  config?: { configurable?: { model?: string } }
): Promise<Partial<AgentState>> {
  console.log("[Architect] 🏗️  开始执行 architect 节点");

  // 从 config 中获取模型名称，默认使用 qwen-plus
  const modelName = config?.configurable?.model || "qwen-plus";
  const llm = createLLM(modelName, {
    model: modelName,
    temperature: 0.3, // 更低的温度确保结构化输出
  });

  // 压缩 prompt 以节省 token
  const promptWithContext = compressPrompt(ARCHITECT_PROMPT);

  // 找到上一个 architect 消息的位置
  let lastArchitectIndex = -1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (
      msg._getType() === "ai" &&
      msg.content.toString().includes("<architectPlan")
    ) {
      lastArchitectIndex = i;
      break;
    }
  }

  // 获取相关的对话上下文
  let relevantMessages: typeof state.messages;

  if (lastArchitectIndex === -1) {
    // 第一次生成计划：获取所有消息
    // 注意：我们不再过滤 Coder 消息，允许 Architect 看到历史代码
    relevantMessages = state.messages;
  } else {
    // 不是第一次：只获取上一个 architect 之后的消息
    // 这将包含上一次 Architect 计划后的 Coder 执行结果，这对后续迭代至关重要
    relevantMessages = state.messages.slice(lastArchitectIndex + 1);
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
    ...relevantMessages, // 上一个 architect 之后的所有消息（排除 coder 消息）
  ];

  console.log("[Architect] 上下文消息数量:", {
    total: messages.length,
    lastArchitectIndex,
    relevantMessagesCount: relevantMessages.length,
    includesFirstUserMessage: !!firstUserMessage,
  });

  try {
    const response = await llm.invoke(messages);

    console.log("[Architect] ✅ 架构规划生成完成", {
      contentLength: response.content.toString().length,
      hasArchitectPlan: response.content.toString().includes("<architectPlan"),
    });

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
export async function coder(
  state: AgentState,
  config?: { configurable?: { model?: string } }
): Promise<Partial<AgentState>> {
  console.log("[Coder] 💻 开始执行 coder 节点", {
    messagesCount: state.messages.length,
    hasCodeContext: !!state.codeContext,
  });

  // 从 config 中获取模型名称，默认使用 qwen-plus
  const modelName = config?.configurable?.model || "qwen-plus";
  const llm = createLLM(modelName, {
    model: modelName,
    temperature: 0.1, // 代码生成需要更确定性的输出
  });

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

  // 准备 prompt，并压缩以节省 token
  const promptWithContext = compressPrompt(CODER_PROMPT);

  // 获取相关的对话上下文
  let relevantMessages: typeof state.messages;

  if (lastCoderIndex === -1) {
    // 第一次生成代码：获取所有消息（包括第一条用户消息和所有 architect）
    relevantMessages = state.messages;
  } else {
    // 不是第一次：保留上一个 coder 的生成结果作为上下文
    // 注意：我们将 lastCoderIndex 包含在内，这样 LLM 能看到自己上次生成的代码
    // 这对于增量修改非常重要，防止 codeContext 同步延迟导致上下文丢失
    relevantMessages = state.messages.slice(lastCoderIndex);
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

  // 调试：打印消息内容摘要
  console.log("[Coder] 📋 消息内容摘要:");
  messages.forEach((msg, idx) => {
    const msgType = msg._getType();
    const content = msg.content.toString();
    console.log(
      `  ${idx}. [${msgType}] 长度:${content.length}, 预览:${content
        .substring(0, 100)
        .replace(/\n/g, " ")}...`
    );
  });

  try {
    console.log("[Coder] 🚀 开始调用 LLM 生成代码...");
    const response = await llm.invoke(messages);

    console.log("[Coder] ✅ 代码生成完成", {
      contentLength: response.content.toString().length,
      hasBoltArtifact: response.content.toString().includes("<boltArtifact"),
      contentPreview: response.content.toString().substring(0, 200),
    });

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
