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
    const content = response.content.toString();

    // 解析计划（新格式：从文本中提取文件信息）
    let plan: AgentPlan | undefined;
    const planMatch = content.match(
      /<architectPlan>([\s\S]*?)<\/architectPlan>/
    );
    if (planMatch?.[1]) {
      try {
        // 从文本内容中提取文件列表
        const planText = planMatch[1].trim();
        const files: Array<{ path: string; description: string }> = [];

        // 匹配文件结构部分（## 📁 文件结构）
        const filesMatch = planText.match(
          /##\s*📁\s*文件结构([\s\S]*?)(?=##|$)/
        );
        if (filesMatch) {
          const filesText = filesMatch[1];
          // 匹配格式：1. **App.tsx** - 描述
          const fileRegex = /\d+\.\s*\*\*(.+?)\*\*\s*-\s*(.+)/g;
          let match;
          while ((match = fileRegex.exec(filesText)) !== null) {
            files.push({
              path: match[1].trim(),
              description: match[2].trim(),
            });
          }
        }

        plan = {
          files,
          dependencies: [
            "antd",
            "@tanstack/react-query",
            "react-i18next",
            "i18next",
            "@ant-design/icons",
          ],
          architecture_notes: planText,
        };
      } catch (e) {
        console.error("Failed to parse architect plan:", e);
      }
    }

    return {
      messages: [response],
      plan: plan,
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

  // 只获取当前对话轮次的关键消息，避免 token 累积
  const lastUserMessage = state.messages
    .filter((m) => m._getType() === "human")
    .slice(-1)[0]; // 完整的用户消息（包含图片）

  const architectResponse = state.messages
    .filter((m) => m._getType() === "ai")
    .slice(-1)[0]; // architect 的规划响应（包含需求分析、组件列表、样式描述）

  // Coder 同时接收：图片（视觉参考）+ Architect 的分析（结构化描述）
  const messages = [
    new SystemMessage(promptWithContext),
    lastUserMessage, // 用户的完整消息（含图片），提供视觉参考
    architectResponse, // Architect 的规划（含需求分析、组件选择、样式指南）
  ];

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
