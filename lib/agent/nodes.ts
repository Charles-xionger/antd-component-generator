// lib/agent/nodes.ts
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "./state";
import { ARCHITECT_PROMPT, CODER_PROMPT } from "./prompts";
import { createLLM } from "./models";
import prisma from "@/lib/database/prisma";

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

  // 检测是否有图片消息
  const hasImageMessages = state.messages.some((msg) => {
    const content = msg.content;
    return (
      Array.isArray(content) &&
      content.some(
        (block) => block.type === "image" || block.type === "image_url"
      )
    );
  });

  // 从 config 中获取模型名称
  // 如果有图片，默认使用视觉模型 (qwen-vl-max-latest)
  // 否则使用纯文本模型 (qwen-plus)
  let modelName = config?.configurable?.model || "qwen-plus";

  if (hasImageMessages && modelName === "qwen-plus") {
    console.log("[Architect] 🖼️  检测到图片消息，自动切换到视觉模型");
    modelName = "qwen-vl-max-latest";
  }

  const llm = createLLM(modelName, {
    model: modelName,
    temperature: 0.3, // 更低的温度确保结构化输出
  });

  console.log(
    "[Architect] 使用模型:",
    modelName,
    hasImageMessages ? "(视觉模型)" : "(文本模型)"
  );

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
    relevantMessages = state.messages;
  } else {
    // 不是第一次：获取上一个 architect 及之后的所有消息
    // 注意：包含 lastArchitectIndex，让 Architect 能看到自己上次的规划
    // 这样可以保持文件结构的一致性，避免规划冲突
    relevantMessages = state.messages.slice(lastArchitectIndex);
  }

  // 🚨 关键：过滤掉 Coder 的消息（包含 <boltArtifact> 的 AI 消息）
  // 防止 Architect 看到代码示例后模仿生成代码
  relevantMessages = relevantMessages.filter((msg) => {
    // 保留所有用户消息
    if (msg._getType() === "human") return true;
    // 保留 architect 消息（包含 <architectPlan>）
    if (
      msg._getType() === "ai" &&
      msg.content.toString().includes("<architectPlan")
    ) {
      return true;
    }
    // 过滤掉 coder 消息（包含 <boltArtifact>）
    if (
      msg._getType() === "ai" &&
      msg.content.toString().includes("<boltArtifact")
    ) {
      console.log("[Architect] 🚫 过滤掉 Coder 消息，防止模仿代码生成");
      return false;
    }
    // 保留其他消息（如系统消息）
    return true;
  });

  console.log("[Architect] 📊 消息过滤结果:", {
    原始消息数: state.messages.slice(
      lastArchitectIndex === -1 ? 0 : lastArchitectIndex
    ).length,
    过滤后消息数: relevantMessages.length,
  });

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

  // 调试：打印消息摘要，帮助排查问题
  console.log("[Architect] 📋 消息摘要:");
  messages.forEach((msg, idx) => {
    const msgType = msg._getType();
    const content = msg.content.toString();
    const preview = content.substring(0, 150).replace(/\n/g, " ");
    console.log(
      `  ${idx}. [${msgType}] 长度:${content.length}, 预览:${preview}...`
    );
  });

  try {
    const response = await llm.invoke(messages);

    const content = response.content.toString();

    console.log("[Architect] ✅ 架构规划生成完成", {
      contentLength: content.length,
      hasArchitectPlan: content.includes("<architectPlan"),
      hasBoltArtifact: content.includes("<boltArtifact"),
    });

    // 🚨 边界检查：Architect 绝对不能输出代码
    if (content.includes("<boltArtifact") || content.includes("<boltAction")) {
      console.error(
        "[Architect] ❌ 检测到越界行为：Architect 输出了代码标签！"
      );
      console.error("[Architect] 🔍 违规内容预览:", content.substring(0, 500));

      // 尝试清理：只保留 </architectPlan> 之前的内容
      const endTag = "</architectPlan>";
      const endIndex = content.indexOf(endTag);

      if (endIndex !== -1) {
        const cleanedContent = content.substring(0, endIndex + endTag.length);
        console.log("[Architect] 🔧 已自动清理越界内容，保留架构方案部分");
        console.log("[Architect] 📝 清理后内容长度:", cleanedContent.length);

        return {
          messages: [new AIMessage(cleanedContent)],
        };
      } else {
        console.error(
          "[Architect] ❌ 无法清理越界内容，未找到 </architectPlan> 标签"
        );
        return {
          messages: [
            new AIMessage(
              "⚠️ 架构师输出格式错误：不能输出代码。请确保只输出 <architectPlan> 标签内的架构方案。"
            ),
          ],
        };
      }
    }

    // 额外检查：确保在 </architectPlan> 之后没有其他内容
    const endTag = "</architectPlan>";
    const endIndex = content.indexOf(endTag);
    if (endIndex !== -1 && endIndex + endTag.length < content.length - 50) {
      const afterContent = content.substring(endIndex + endTag.length).trim();
      if (afterContent.length > 0) {
        console.warn(
          "[Architect] ⚠️ 检测到 </architectPlan> 后有额外内容，长度:",
          afterContent.length
        );
        console.warn(
          "[Architect] 🔍 额外内容预览:",
          afterContent.substring(0, 200)
        );

        // 自动截断
        const cleanedContent = content.substring(0, endIndex + endTag.length);
        console.log("[Architect] ✂️ 已自动截断多余内容");

        return {
          messages: [new AIMessage(cleanedContent)],
        };
      }
    }

    // 检查是否包含架构方案
    if (!content.includes("<architectPlan")) {
      console.error("[Architect] ❌ 响应中没有 <architectPlan> 标签");
      return {
        messages: [
          new AIMessage("⚠️ 架构师输出格式错误：缺少 <architectPlan> 标签。"),
        ],
      };
    }

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

  // 检测是否有图片消息
  const hasImageMessages = state.messages.some((msg) => {
    const content = msg.content;
    return (
      Array.isArray(content) &&
      content.some(
        (block) => block.type === "image" || block.type === "image_url"
      )
    );
  });

  // 从 config 中获取模型名称
  // 如果有图片，默认使用视觉模型 (qwen-vl-max-latest)
  // 否则使用纯文本模型 (qwen-plus)
  let modelName = config?.configurable?.model || "qwen-plus";

  if (hasImageMessages && modelName === "qwen-plus") {
    console.log("[Coder] 🖼️  检测到图片消息，自动切换到视觉模型");
    modelName = "qwen-vl-max-latest";
  }

  const llm = createLLM(modelName, {
    model: modelName,
    temperature: 0.1, // 代码生成需要更确定性的输出
  });

  console.log(
    "[Coder] 使用模型:",
    modelName,
    hasImageMessages ? "(视觉模型)" : "(文本模型)"
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
    const rawContent = msg.content;

    // 处理多模态消息
    let contentDesc: string;
    if (typeof rawContent === "string") {
      contentDesc = `字符串, 长度:${rawContent.length}, 预览:${rawContent
        .substring(0, 100)
        .replace(/\n/g, " ")}`;
    } else if (Array.isArray(rawContent)) {
      const types = rawContent.map((c) => c.type || "unknown").join(",");
      contentDesc = `数组[${rawContent.length}], 类型:[${types}]`;
      // 详细输出每个元素
      rawContent.forEach((item, i) => {
        if (item.type === "text") {
          const text = String(item.text || "");
          console.log(`    [${i}] text: ${text.substring(0, 50)}...`);
        } else if (item.type === "image") {
          const data = String(item.data || "");
          console.log(
            `    [${i}] image: mime=${item.mime_type}, data=${data.substring(
              0,
              30
            )}...`
          );
        } else {
          console.log(
            `    [${i}] ${item.type}: ${JSON.stringify(item).substring(
              0,
              50
            )}...`
          );
        }
      });
    } else {
      contentDesc = `其他类型: ${typeof rawContent}`;
    }

    console.log(`  ${idx}. [${msgType}] ${contentDesc}`);
  });

  try {
    const response = await llm.invoke(messages);
    const content = response.content.toString();

    console.log("[Coder] ✅ 代码生成完成", {
      contentLength: content.length,
      hasBoltArtifact: content.includes("<boltArtifact"),
      contentPreview: content.substring(0, 200),
    });

    // 创建新的 AIMessage 带上修改后的内容
    const messageWithVersion = new AIMessage(content);

    return {
      messages: [messageWithVersion],
      generatedArtifact: content,
    };
  } catch (networkError) {
    console.error("Network error in coder:", networkError);
    // 网络错误时返回错误消息
    return {
      messages: [new AIMessage("网络连接错误，无法生成代码")],
      generatedArtifact: "网络连接错误，请检查网络设置后重试。",
    };
  }
}
