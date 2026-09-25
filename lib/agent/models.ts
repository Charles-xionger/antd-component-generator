// lib/agent/models.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { TITLE_GENERATION_PROMPT } from "./prompts";
import { MODEL_API_CONFIG } from "./config";

export interface ModelConfig {
  model: string;
  temperature: number;
}

/**
 * 创建 LLM 实例的工厂函数
 * @param modelName 模型名称（如 "qwen3.7-flash-2026-07-15"）
 * @param config 模型配置
 * @returns LLM 实例
 */
export function createLLM(
  modelName: string,
  config: ModelConfig,
): BaseChatModel {
  // Gemini 模型（支持视觉）
  if (modelName.startsWith("gemini")) {
    return new ChatGoogleGenerativeAI({
      model: process.env.GOOGLE_MODEL_NAME || "gemini-3-pro-preview",
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: config.temperature,
      streaming: true,
    });
  }

  // Claude 模型（支持视觉）
  if (modelName.startsWith("claud")) {
    return new ChatOpenAI({
      model: "claude-opus-4-5-20251101",
      temperature: 0.3,
      apiKey: process.env.AI302_API_KEY,
      configuration: {
        baseURL: process.env.AI302_BASE_URL || "https://api.302.ai/v1",
      },
      maxRetries: MODEL_API_CONFIG.MAX_RETRIES,
      timeout: MODEL_API_CONFIG.TIMEOUT,
      maxTokens: MODEL_API_CONFIG.MAX_TOKENS, // 设置最大输出 token
    });
  }

  // 通义模型：严格使用调用方选择的模型。
  // 模型名称由界面选择并原样传给百炼 OpenAI 兼容接口。
  return new ChatOpenAI({
    model: modelName,
    temperature: config.temperature,
    apiKey: process.env.ALIYUN_API_KEY,
    configuration: {
      baseURL:
        process.env.ALIYUN_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    maxRetries: MODEL_API_CONFIG.MAX_RETRIES,
    timeout: MODEL_API_CONFIG.TIMEOUT,
    maxTokens: MODEL_API_CONFIG.MAX_TOKENS, // 设置最大输出 token
    streaming: true,
  });
}

/**
 * 生成会话标题
 * @param userMessage 用户的首条消息
 * @param aiResponse AI 的回复内容（可选）
 * @param modelName 使用的模型名称
 * @returns 生成的简洁标题
 */
export async function generateThreadTitle(
  userMessage: string,
  aiResponse: string = "",
  modelName: string = "qwen3.7-flash-2026-07-15",
): Promise<string> {
  try {
    // 创建一个专门用于标题生成的 LLM，使用较低的 temperature
    const llm = createLLM(modelName, {
      model: modelName,
      temperature: MODEL_API_CONFIG.TEMPERATURE.TITLE_GENERATION,
    });

    // 构建提示内容
    const content = `用户消息：${userMessage}\n\nAI回复：${aiResponse.slice(
      0,
      200,
    )}`;

    const response = await llm.invoke([
      new SystemMessage(TITLE_GENERATION_PROMPT),
      new HumanMessage(content),
    ]);

    const title = response.content.toString().trim();

    // 确保标题不为空且长度合理
    if (!title || title.length === 0) {
      return userMessage.slice(0, 20);
    }

    // 限制标题长度（最多30个字符）
    return title.length > 30 ? title.slice(0, 30) : title;
  } catch (error) {
    console.error("生成标题失败:", error);
    // 失败时使用用户消息的前20个字符作为后备
    return userMessage.slice(0, 20) || "新会话";
  }
}
