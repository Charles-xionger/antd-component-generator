// lib/agent/nodes.ts
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { AgentState } from "./state";
import { ARCHITECT_PROMPT, CODER_PROMPT } from "./prompts";

// JSON解析工具函数
function extractJSONFromResponse(response: string): string {
  // 移除markdown代码块标记
  let cleaned = response.trim();

  // 先检查是否有 XML 标签包裹
  const xmlMatch = cleaned.match(
    /<architectPlan>\s*([\s\S]*?)\s*<\/architectPlan>/
  );
  if (xmlMatch) {
    cleaned = xmlMatch[1].trim();
  }

  // 检查是否有```json...```格式
  const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // 检查是否有```...```格式（没有language标识符）
  const codeBlockMatch = cleaned.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    // 验证是否是JSON格式（以{开头，以}结尾）
    if (content.startsWith("{") && content.endsWith("}")) {
      cleaned = content;
    }
  }

  return cleaned;
}

const baseModelConfig = {
  model: process.env.NEXT_PUBLIC_ALIYUN_MODEL_NAME || "qwen-plus",
  temperature: 0.7,
  apiKey: process.env.ALIYUN_API_KEY,
  configuration: {
    baseURL:
      process.env.ALIYUN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
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
  const llm = new ChatOpenAI({
    ...baseModelConfig,
    temperature: 0.3, // 更低的温度确保结构化输出
  });

  const lastUserMessage =
    state.messages.filter((m) => m._getType() === "human").slice(-1)[0]
      ?.content || "";

  // 注入代码上下文到 architect prompt
  const promptWithContext = ARCHITECT_PROMPT.replace(
    "{codeContext}",
    state.codeContext || "这是一个新项目，没有现有代码。"
  );

  const messages = [
    new SystemMessage(promptWithContext),
    new HumanMessage(`用户需求：${lastUserMessage}`),
  ];

  try {
    const response = await llm.invoke(messages);
    const rawResponse = response.content.toString();

    try {
      const cleanedContent = extractJSONFromResponse(rawResponse);
      const plan = JSON.parse(cleanedContent);

      // LLM 应该已经包裹了标签，如果没有则添加（fallback）
      const finalContent = rawResponse.includes("<architectPlan>")
        ? rawResponse
        : `<architectPlan>\n${JSON.stringify(plan, null, 2)}\n</architectPlan>`;

      return {
        messages: [new AIMessage(finalContent)],
        plan,
      };
    } catch (parseError) {
      // 如果解析失败，重试一次
      console.warn("JSON解析失败:", parseError);
      console.log("原始响应:", response.content.toString());
      const retryMessages = [
        ...messages,
        response,
        new HumanMessage(
          "请确保输出有效的JSON格式，不要包含markdown代码块标记"
        ),
      ];

      try {
        const retryResponse = await llm.invoke(retryMessages);
        const rawRetryResponse = retryResponse.content.toString();
        const cleanedRetryContent = extractJSONFromResponse(rawRetryResponse);
        const plan = JSON.parse(cleanedRetryContent);

        // LLM 应该已经包裹了标签，如果没有则添加（fallback）
        const finalContent = rawRetryResponse.includes("<architectPlan>")
          ? rawRetryResponse
          : `<architectPlan>\n${JSON.stringify(
              plan,
              null,
              2
            )}\n</architectPlan>`;

        return {
          messages: [new AIMessage(finalContent)],
          plan,
        };
      } catch {
        const defaultPlan = {
          files: [{ path: "/App.tsx", description: "主应用组件" }],
          dependencies: [],
          architecture_notes: "解析失败，使用默认方案",
        };
        const wrappedContent = `<architectPlan>\n${JSON.stringify(
          defaultPlan,
          null,
          2
        )}\n</architectPlan>`;

        return {
          messages: [new AIMessage(wrappedContent)],
          plan: defaultPlan,
        };
      }
    }
  } catch (networkError) {
    console.error("Network error in architect:", networkError);
    // 网络错误时返回默认计划
    const defaultPlan = {
      files: [{ path: "/App.tsx", description: "主应用组件" }],
      dependencies: [],
      architecture_notes: "网络错误，使用默认方案",
    };
    const wrappedContent = `<architectPlan>\n${JSON.stringify(
      defaultPlan,
      null,
      2
    )}\n</architectPlan>`;

    return {
      messages: [new AIMessage(wrappedContent)],
      plan: defaultPlan,
    };
  }
}

// Coder Node: 生成代码
export async function coder(state: AgentState): Promise<Partial<AgentState>> {
  const llm = new ChatOpenAI({
    ...baseModelConfig,
    temperature: 0.1, // 代码生成需要更确定性的输出
  });

  const lastUserMessage =
    state.messages.filter((m) => m._getType() === "human").slice(-1)[0]
      ?.content || "";

  // 准备 prompt，注入代码上下文
  const promptWithContext = CODER_PROMPT.replace(
    "{codeContext}",
    state.codeContext || "这是一个新项目，没有现有代码。"
  );

  const messages = [
    new SystemMessage(promptWithContext),
    new HumanMessage(`
架构师的计划：
${JSON.stringify(state.plan, null, 2)}

用户需求：${lastUserMessage}

请生成完整的代码实现。
    `),
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
