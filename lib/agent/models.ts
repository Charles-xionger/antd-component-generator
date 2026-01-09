// lib/agent/models.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { TITLE_GENERATION_PROMPT } from "./prompts";

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
  // Gemini 模型（支持视觉）
  if (modelName.startsWith("gemini")) {
    return new ChatGoogleGenerativeAI({
      model: modelName,
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
      maxRetries: 3,
      timeout: 30000,
    });
  }

  // 默认使用 Qwen 视觉模型（qwen-vl-max-latest 支持图片理解）
  return new ChatOpenAI({
    model: "qwen-vl-max-latest", // 使用支持视觉的模型
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
  modelName: string = "qwen-plus"
): Promise<string> {
  try {
    // 创建一个专门用于标题生成的 LLM，使用较低的 temperature
    const llm = createLLM(modelName, {
      model: modelName,
      temperature: 0.3, // 使用较低的温度以获得更稳定的输出
    });

    // 构建提示内容
    const content = `用户消息：${userMessage}\n\nAI回复：${aiResponse.slice(
      0,
      200
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
