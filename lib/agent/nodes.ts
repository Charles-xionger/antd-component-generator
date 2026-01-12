// lib/agent/nodes.ts
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { AgentState, SceneType } from "./state";
import { ARCHITECT_PROMPT, CODER_PROMPT } from "./prompts";
import { createLLM } from "./models";
import { parseXmlToFiles } from "./utils";
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

/**
 * Scene Detector Node: 判断用户意图场景
 * 根据用户消息和代码上下文，智能判断场景类型
 */
export async function sceneDetector(
  state: AgentState,
  config?: { configurable?: { model?: string } }
): Promise<Partial<AgentState>> {
  console.log("[SceneDetector] 🎯 开始场景判断", {
    messagesCount: state.messages.length,
    hasCodeContext: !!state.codeContext,
  });

  // 获取最新的用户消息
  const lastUserMessage = state.messages
    .slice()
    .reverse()
    .find((msg) => msg._getType() === "human");

  if (!lastUserMessage) {
    console.log("[SceneDetector] 没有用户消息，默认为 new 场景");
    return { sceneType: "new" };
  }

  const userContent =
    typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage.content)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastUserMessage.content.map((c: any) => c.text || "").join("")
      : "";

  const contentLower = userContent.toLowerCase();

  // 判断是否有现有代码
  const hasExistingCode = !!state.codeContext && state.codeContext.trim().length > 0;

  // 场景判断逻辑
  let sceneType: SceneType = "unknown";

  // 1. Bug 修复场景：用户提到错误、报错、bug、修复等，且有现有代码
  const isBugFixKeywords =
    contentLower.includes("报错") ||
    contentLower.includes("错误") ||
    contentLower.includes("bug") ||
    contentLower.includes("修复") ||
    contentLower.includes("builderror") ||
    contentLower.includes("error") ||
    contentLower.includes("exception") ||
    contentLower.includes("异常") ||
    contentLower.includes("问题") ||
    contentLower.includes("查看代码") ||
    contentLower.includes("定位") ||
    contentLower.includes("诊断");

  if (isBugFixKeywords && hasExistingCode) {
    sceneType = "bug-fix";
    console.log("[SceneDetector] ✅ 判断为 bug-fix 场景");
  }
  // 2. 修改场景：用户要求修改、优化、增加功能等，且有现有代码
  else if (
    (contentLower.includes("修改") ||
      contentLower.includes("优化") ||
      contentLower.includes("增加") ||
      contentLower.includes("添加") ||
      contentLower.includes("调整") ||
      contentLower.includes("改进")) &&
    hasExistingCode
  ) {
    sceneType = "modify";
    console.log("[SceneDetector] ✅ 判断为 modify 场景");
  }
  // 3. 新项目场景：没有现有代码，或用户明确要求重写
  else if (
    !hasExistingCode ||
    contentLower.includes("重写") ||
    contentLower.includes("重新生成") ||
    contentLower.includes("不基于现有代码")
  ) {
    sceneType = "new";
    console.log("[SceneDetector] ✅ 判断为 new 场景");
  }
  // 4. 默认：如果有现有代码，可能是修改场景
  else if (hasExistingCode) {
    sceneType = "modify";
    console.log("[SceneDetector] ✅ 默认判断为 modify 场景（有现有代码）");
  } else {
    sceneType = "new";
    console.log("[SceneDetector] ✅ 默认判断为 new 场景（无现有代码）");
  }

  console.log("[SceneDetector] 📊 场景判断结果:", {
    sceneType,
    hasExistingCode,
    userContentPreview: userContent.substring(0, 100),
  });

  return { sceneType };
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

  // 🔴 根据场景类型决定代码上下文
  // - bug-fix 场景：提供完整代码，便于诊断问题
  // - 其他场景：提供简化代码（前5行），减少干扰和 token 消耗
  let codeContextForArchitect = "";
  if (state.codeContext) {
    const sceneType = state.sceneType || "new";
    
    if (sceneType === "bug-fix") {
      // Bug 修复场景：提供完整代码
      console.log("[Architect] 🐛 Bug 修复场景，使用完整代码上下文");
      codeContextForArchitect = state.codeContext;
    } else {
      // 新项目/修改场景：提供简化代码（前5行）
      console.log("[Architect] 📝 非 Bug 修复场景，使用简化代码上下文");
      const fileMatches = state.codeContext.matchAll(
        /<boltAction\s+type="file"\s+filePath="([^"]+)">([\s\S]*?)<\/boltAction>/g
      );
      for (const match of fileMatches) {
        const filePath = match[1];
        const content = match[2];
        const firstLines = content.trim().split("\n").slice(0, 5).join("\n");
        codeContextForArchitect += `File: ${filePath}\n${firstLines}\n...\n\n`;
      }
    }
  }

  // 确保包含第一条用户消息（含图片），作为视觉参考
  const firstUserMessage = state.messages.find((m) => m._getType() === "human");
  const hasFirstUserInRelevant = relevantMessages.some(
    (m) => m === firstUserMessage
  );

  // 构建消息列表
  const messages = [
    new SystemMessage(
      promptWithContext +
        (codeContextForArchitect
          ? `\n\n### 现有文件结构参考：\n${codeContextForArchitect}`
          : "")
    ),
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
              "⚠️ 架构师输出格式错误：不能输出代码。请确保只输出 architectPlan 标签内的架构方案。"
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
      console.log(
        "[Architect] ℹ️ 响应中没有 <architectPlan> 标签 (可能是闲聊或拒绝)"
      );
      // 不再强制返回错误，允许 Architect 进行闲聊或拒绝生成
      return {
        messages: [response],
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

// Artifact Saver Node: 保存生成的代码到数据库
export async function artifactSaver(
  state: AgentState,
  config?: { configurable?: { thread_id?: string } }
): Promise<Partial<AgentState>> {
  console.log("[ArtifactSaver] 💾 开始执行保存节点");

  const threadId = config?.configurable?.thread_id;
  if (!threadId) {
    console.error("[ArtifactSaver] ❌ 缺少 thread_id，无法保存");
    return {};
  }

  // 获取最新的生成内容
  // 优先使用 state.generatedArtifact，如果没有则尝试从最后一条消息提取
  let content = state.generatedArtifact;
  if (!content) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && lastMessage._getType() === "ai") {
      content = lastMessage.content.toString();
    }
  }

  if (!content || !content.includes("<boltArtifact")) {
    console.log("[ArtifactSaver] ℹ️ 没有检测到有效的 Artifact 内容，跳过保存");
    return {};
  }

  try {
    // 1. 解析文件
    const files = parseXmlToFiles(content);
    if (files.length === 0) {
      console.log("[ArtifactSaver] ⚠️ 解析后文件列表为空，跳过保存");
      return {};
    }

    // 2. 检查完整性 (简单检查)
    const hasAppTsx = files.some(
      (f) => f.path === "App.tsx" || f.path.endsWith("/App.tsx")
    );
    if (!hasAppTsx) {
      console.warn("[ArtifactSaver] ⚠️ 警告：生成的代码缺少 App.tsx");
      // 这里我们可以选择继续保存，或者中止。为了数据安全，最好还是保存，但可以在描述里标记
    }

    console.log(
      `[ArtifactSaver] 准备保存 ${files.length} 个文件到 Thread: ${threadId}`
    );

    // 3. 数据库操作 (复用 api/artifact/save 的逻辑)
    // 查找该 thread 下的 artifact
    const artifact = await prisma.artifact.findUnique({
      where: { threadId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { files: true },
        },
      },
    });

    const currentVersion = artifact?.versions[0];
    const currentFiles = currentVersion?.files || [];

    if (!artifact) {
      // 创建新的 Artifact 和第一个版本
      const newArtifact = await prisma.artifact.create({
        data: {
          threadId,
          versions: {
            create: {
              versionNumber: 1,
              description: "初始版本 (Auto-Saved)",
              files: {
                create: files.map((file) => ({
                  path: file.path,
                  content: file.content,
                })),
              },
            },
          },
        },
      });
      console.log("[ArtifactSaver] ✅ 创建新 Artifact:", newArtifact.id);
    } else {
      // 合并逻辑：旧文件 + 新文件 = 新快照
      const currentFilesMap = new Map(
        currentFiles.map((f) => [f.path, f.content])
      );

      // 用新文件覆盖旧文件
      files.forEach((file) => {
        currentFilesMap.set(file.path, file.content);
      });

      const mergedFiles = Array.from(currentFilesMap.entries()).map(
        ([path, content]) => ({
          path,
          content,
        })
      );

      // 重新查询最新版本号
      const latestVersion = await prisma.artifactVersion.findFirst({
        where: { artifactId: artifact.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

      const newVersion = await prisma.artifactVersion.create({
        data: {
          artifactId: artifact.id,
          versionNumber: nextVersionNumber,
          description: `自动保存于 ${new Date().toLocaleString()}`,
          files: {
            create: mergedFiles,
          },
        },
      });
      console.log(
        "[ArtifactSaver] ✅ 创建新版本:",
        newVersion.id,
        "v" + nextVersionNumber
      );
    }

    // 可以返回一个系统消息通知保存成功，或者不做任何事
    // return { messages: [new SystemMessage("代码已自动保存到数据库。")] };
    return {};
  } catch (error) {
    console.error("[ArtifactSaver] ❌ 保存失败:", error);
    return {};
  }
}

// Coder Node: 生成代码
export async function coder(
  state: AgentState,
  config?: { configurable?: { model?: string; thread_id?: string } }
): Promise<Partial<AgentState>> {
  console.log("[Coder] 💻 开始执行 coder 节点", {
    messagesCount: state.messages.length,
    hasCodeContext: !!state.codeContext,
  });

  // 🔴 优化：Coder 只保留上一次生成的完整代码作为参考，移除历史冗余代码
  // 我们手动构造 codeContext，确保它被 <boltArtifact> 包裹，
  // 这样 LLM 清楚这是之前的状态，且不容易受到历史 Prompt 的干扰。
  const lastGeneratedArtifact = state.generatedArtifact || state.codeContext;
  const optimizedCodeContext = lastGeneratedArtifact
    ? lastGeneratedArtifact.includes("<boltArtifact")
      ? lastGeneratedArtifact
      : `<boltArtifact id="previous-state" title="Previous State">\n${lastGeneratedArtifact}\n</boltArtifact>`
    : "";

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

  // 🔴 关键修复：确保 Coder 能看到最新的 Architect 规划（包含截图分析）
  // 找到最后一个 architect 消息
  let lastArchitectMessage = null;

  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (
      msg._getType() === "ai" &&
      msg.content.toString().includes("<architectPlan")
    ) {
      lastArchitectMessage = msg;
      break;
    }
  }

  // 确保包含第一条用户消息（含图片），作为视觉参考
  const firstUserMessage = state.messages.find((m) => m._getType() === "human");
  const hasFirstUserInRelevant = relevantMessages.some(
    (m) => m === firstUserMessage
  );

  // 🛡️ 将 Architect 的 Plan 转换为 HumanMessage 指令
  // 这样可以强制 Coder 转换角色，将其视为输入指令而不是自己的历史输出
  // 避免 Coder 模仿 Architect 的语气或尝试"完善"计划
  let architectPlanInstruction: HumanMessage | null = null;
  if (lastArchitectMessage) {
    const planContent =
      typeof lastArchitectMessage.content === "string"
        ? lastArchitectMessage.content
        : Array.isArray(lastArchitectMessage.content)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lastArchitectMessage.content.map((c: any) => c.text || "").join("")
        : "";

    architectPlanInstruction = new HumanMessage(
      `👉 **Architect Design Plan**:\n\n${planContent}\n\n🚨 **Instruction**: Please implement the above design plan immediately. Generate the full code structure as specified.`
    );
  }

  // 构建消息列表
  const messages = [
    new SystemMessage(
      promptWithContext.replace("{codeContext}", optimizedCodeContext)
    ),
    // 如果相关消息中没有第一条用户消息，添加它（提供图片等视觉参考）
    ...(hasFirstUserInRelevant
      ? []
      : firstUserMessage
      ? [firstUserMessage]
      : []),
    // 过滤掉原始的 Architect 消息（因为它会被包装成指令放在最后）
    ...relevantMessages.filter((msg) => msg !== lastArchitectMessage),
    // 将 Architect Plan 作为最新的用户指令添加
    ...(architectPlanInstruction ? [architectPlanInstruction] : []),
  ];

  console.log("[Coder] 上下文消息数量:", {
    total: messages.length,
    lastCoderIndex,
    relevantMessagesCount: relevantMessages.length,
    includesFirstUserMessage: !!firstUserMessage,
    includesLatestArchitect: !!lastArchitectMessage,
    hasPlanInstruction: !!architectPlanInstruction,
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

  // 🔍 详细打印完整消息内容（用于调试）
  console.log("\n[Coder] 🔍 完整消息内容:");
  messages.forEach((msg, idx) => {
    console.log(`\n========== 消息 ${idx} [${msg._getType()}] ==========`);
    const rawContent = msg.content;
    if (typeof rawContent === "string") {
      console.log(rawContent.substring(0, 500));
      if (rawContent.length > 500) {
        console.log(`... (剩余 ${rawContent.length - 500} 字符)`);
      }
    } else if (Array.isArray(rawContent)) {
      rawContent.forEach((item, i) => {
        console.log(`\n--- 内容块 ${i} (${item.type}) ---`);
        if (item.type === "text") {
          const text = String(item.text || "");
          console.log(text.substring(0, 300));
          if (text.length > 300) {
            console.log(`... (剩余 ${text.length - 300} 字符)`);
          }
        } else if (item.type === "image") {
          console.log(`图片: mime_type=${item.mime_type}`);
          console.log(`数据长度: ${String(item.data || "").length} 字符`);
        } else {
          console.log(JSON.stringify(item, null, 2));
        }
      });
    }
  });
  console.log("\n========== 消息内容结束 ==========\n");

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

    // ==========================================
    // 🛡️ 后端自动保存逻辑
    // ==========================================
    try {
      // 1. 检查生成内容是否包含有效的 Artifact
      if (
        content.includes("<boltArtifact") &&
        content.includes("</boltArtifact>")
      ) {
        const threadId = config?.configurable?.thread_id;
        if (threadId) {
          console.log(
            `[Coder] 💾 自动保存生成结果到数据库... Thread: ${threadId}`
          );

          // 2. 解析文件
          const files = parseXmlToFiles(content);

          if (files.length > 0) {
            // 3. 检查入口文件完整性
            const hasAppTsx = files.some(
              (f) => f.path === "App.tsx" || f.path.endsWith("/App.tsx")
            );

            if (hasAppTsx) {
              // 4. 执行保存操作 (模拟 api/artifact/save 逻辑)
              const artifact = await prisma.artifact.findUnique({
                where: { threadId },
                include: {
                  versions: {
                    orderBy: { versionNumber: "desc" },
                    take: 1,
                    include: { files: true },
                  },
                },
              });

              const currentVersion = artifact?.versions[0];
              const currentFiles = currentVersion?.files || [];

              if (!artifact) {
                // 创建新 Artifact
                await prisma.artifact.create({
                  data: {
                    threadId,
                    versions: {
                      create: {
                        versionNumber: 1,
                        description: "初始版本 (Auto-Saved by Coder)",
                        files: {
                          create: files.map((file) => ({
                            path: file.path,
                            content: file.content,
                          })),
                        },
                      },
                    },
                  },
                });
                console.log("[Coder] ✅ 新 Artifact 创建成功");
              } else {
                // 合并文件
                const currentFilesMap = new Map(
                  currentFiles.map((f) => [f.path, f.content])
                );
                files.forEach((file) => {
                  currentFilesMap.set(file.path, file.content);
                });
                const mergedFiles = Array.from(currentFilesMap.entries()).map(
                  ([path, content]) => ({ path, content })
                );

                // 创建新版本
                const nextVersionNumber =
                  (currentVersion?.versionNumber || 0) + 1;
                await prisma.artifactVersion.create({
                  data: {
                    artifactId: artifact.id,
                    versionNumber: nextVersionNumber,
                    description: `自动更新于 ${new Date().toLocaleString()} (Auto-Saved)`,
                    files: {
                      create: mergedFiles,
                    },
                  },
                });
                console.log(
                  `[Coder] ✅ Artifact v${nextVersionNumber} 更新成功`
                );
              }
            } else {
              console.warn("[Coder] ⚠️ 生成结果缺少 App.tsx，跳过自动保存");
            }
          }
        }
      }
    } catch (saveError) {
      console.error("[Coder] ❌ 自动保存失败 (非致命错误):", saveError);
      // 注意：保存失败不应影响主流程，依然返回生成的 message
    }

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
