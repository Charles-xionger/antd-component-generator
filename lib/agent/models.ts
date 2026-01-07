// lib/agent/models.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export interface ModelConfig {
  model: string;
  temperature: number;
}

/**
 * 创建 LLM 实例的工厂函数
 * @param modelName 模型名称（如 "qwen-plus", "gemini-2.0-flash-exp"）
 * @param config 模型配置
 * @returns LLM 实例
 */
export function createLLM(
  modelName: string,
  config: ModelConfig
): BaseChatModel {
  // Gemini 模型
  if (modelName.startsWith("gemini")) {
    return new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: config.temperature,
      streaming: true,
    });
  }

  // claud 模型
  if (modelName.startsWith("claud")) {
    new ChatOpenAI({
      model: "claude-sonnet-4-20250514", // 固定使用 sonnet 4
      temperature: config.temperature,
      apiKey: process.env.AI302_API_KEY,
      configuration: {
        baseURL: process.env.AI302_BASE_URL || "https://api.302.ai/v1",
      },
      maxRetries: 3,
      timeout: 30000,
    });
  }

  // 默认使用 Qwen 或其他 OpenAI 兼容模型
  return new ChatOpenAI({
    model: modelName || "qwen-plus",
    temperature: config.temperature,
    apiKey: process.env.ALIYUN_API_KEY,
    configuration: {
      baseURL:
        process.env.ALIYUN_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    maxRetries: 3,
    timeout: 30000,
  });
}
