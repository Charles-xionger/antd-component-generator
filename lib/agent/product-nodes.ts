import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "./models";
import type { AgentState } from "./state";
import type { AppBlueprint, RequirementSpec } from "@/lib/app-contracts";
import { appBlueprintSchema, intentResultSchema, requirementSpecSchema } from "@/lib/app-contracts";
import { BUSINESS_ANALYST_PROMPT, INTENT_ROUTER_PROMPT, SOLUTION_ARCHITECT_PROMPT } from "./prompts/product";

function textContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "object" && part && "text" in part ? String(part.text) : "").join("");
  return String(content || "");
}

function taggedJson(content: string, tag: string) {
  const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? JSON.parse(match[1]) : undefined;
}

function descriptiveText(value: unknown, fallback: string) {
  if (typeof value === "string") return value.trim() || fallback;
  if (!value || typeof value !== "object") return String(value || fallback);
  const record = value as Record<string, unknown>;
  const title = String(record.name || record.title || record.description || record.id || fallback);
  const steps = Array.isArray(record.steps) ? record.steps.map(String).filter(Boolean) : [];
  return steps.length ? `${title}：${steps.join(" → ")}` : title;
}

function descriptiveList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.map((entry, index) => descriptiveText(entry, `项目 ${index + 1}`)).filter(Boolean);
  return normalized.length ? normalized : fallback;
}

export function normalizeRequirementSpec(raw: Record<string, unknown>): RequirementSpec {
  return requirementSpecSchema.parse({
    name: String(raw.name || "内部轻应用"),
    goal: String(raw.goal || raw.description || "解决核心业务问题"),
    actors: descriptiveList(raw.actors, ["业务用户"]),
    workflows: descriptiveList(raw.workflows, ["完成核心业务流程"]),
    entities: descriptiveList(raw.entities),
    businessRules: descriptiveList(raw.businessRules),
    outOfScope: descriptiveList(raw.outOfScope),
    acceptanceCriteria: descriptiveList(raw.acceptanceCriteria, ["核心业务流程可以完成"]),
    confirmed: raw.confirmed === true,
  });
}

function requirementFromMessages(state: AgentState) {
  for (const message of [...state.messages].reverse()) {
    if (message._getType() !== "ai") continue;
    try {
      const raw = taggedJson(textContent(message.content), "requirementSpec") as Record<string, unknown> | undefined;
      if (!raw) continue;
      try { return requirementSpecSchema.parse(raw); }
      catch { return normalizeRequirementSpec(raw); }
    } catch { /* keep searching older valid requirement specs */ }
  }
  return undefined;
}

function isProceedCommand(value: string) {
  return /^(?:确认|确认开发|确认开始开发|开始开发|可以开发|继续开发|继续|生成代码|输出代码|开始生成)[。！!\s]*$/.test(value.trim());
}

/** 用户明确授权平台采用合理默认值并直接推进，不再把可默认细节当成阻塞问题。 */
export function delegatesBusinessDefaults(value: string) {
  const normalized = value.trim().replace(/[。！!，,；;]+/g, " ");
  if (!normalized) return false;
  return [
    /(?:直接|马上|立即)\s*(?:生成|做|开发|输出)(?:一个|一|首个|第一)?(?:版本|版|结果|应用)?/,
    /(?:先|尽快)\s*(?:生成|做|开发|输出|出)(?:一个|一|首个|第一)?(?:版本|版|结果|应用|来)?/,
    /你(?:来|自己)?\s*(?:决定|定|看着办)/,
    /按(?:照)?\s*(?:合理|常规|通用|成熟)?\s*默认(?:值|方案|规则)?/,
    /(?:合理|常规|通用|成熟)\s*默认(?:值|方案|规则)?/,
    /先\s*做出来/,
    /不要(?:再)?\s*(?:问|追问|确认)/,
  ].some((pattern) => pattern.test(normalized));
}

function modelFor(config?: { configurable?: { model?: string } }) {
  const model = config?.configurable?.model || "qwen3.7-flash-2026-07-15";
  return createLLM(model, { model, temperature: 0.1 });
}

function sqlTypeToFieldType(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type.includes("bool")) return "boolean";
  if (type.includes("timestamp")) return "datetime";
  if (type === "date" || type.startsWith("date ")) return "date";
  if (type.includes("uuid")) return "uuid";
  if (type.includes("json")) return "json";
  if (type.includes("decimal") || type.includes("numeric") || type.includes("float")) return "number";
  if (type.includes("int") || type.includes("serial")) return "integer";
  return "string";
}

/**
 * 将常见但不完全符合契约的 Blueprint 输出收敛到平台 V1 契约。
 * 模型输出仍会在前端作为方案卡片展示；后续 Coder 只接收规范化结果。
 */
export function normalizeAppBlueprint(
  raw: Record<string, unknown>,
  requirement?: RequirementSpec,
): AppBlueprint {
  const rawProduct =
    raw.product && typeof raw.product === "object"
      ? (raw.product as Record<string, unknown>)
      : {};
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const textList = (value: unknown) =>
    list(value).map(String).filter(Boolean);

  const pages = list(raw.pages).map((value, index) => {
    const page = value as Record<string, unknown>;
    const id = String(page.id || `page_${index + 1}`);
    return {
      id,
      title: String(page.title || page.name || `页面 ${index + 1}`),
      route: String(
        page.route ||
          `/${id.replace(/^page_/, "").replace(/_/g, "-") || "home"}`,
      ),
      operations: textList(page.operations),
    };
  });

  const entities = list(raw.entities).map((value, index) => {
    const entity = value as Record<string, unknown>;
    const id = String(entity.id || `entity_${index + 1}`);
    const rawFields = list(entity.fields).length
      ? list(entity.fields)
      : list(entity.columns);
    const fields = rawFields.map((fieldValue, fieldIndex) => {
      const field = fieldValue as Record<string, unknown>;
      const rawType = String(field.type || "string");
      return {
        name: String(field.name || `field_${fieldIndex + 1}`),
        type: sqlTypeToFieldType(rawType),
        required:
          typeof field.required === "boolean"
            ? field.required
            : /NOT NULL|PRIMARY KEY/i.test(rawType),
      };
    });
    return {
      id,
      table: String(entity.table || id).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      description: String(entity.description || entity.name || id),
      fields:
        fields.length > 0
          ? fields
          : [{ name: "id", type: "uuid" as const, required: true }],
    };
  });

  const operations = list(raw.operations).map((value, index) => {
    const operation = value as Record<string, unknown>;
    const rawMethod = String(operation.method || "POST").toUpperCase();
    const method = rawMethod === "PUT" ? "PATCH" : rawMethod;
    return {
      id: String(operation.id || `operation_${index + 1}`),
      method,
      path: String(operation.path || `/api/operations/operation_${index + 1}`),
      description: String(operation.description || operation.id || `业务操作 ${index + 1}`),
      inputSchema:
        operation.inputSchema && typeof operation.inputSchema === "object"
          ? (operation.inputSchema as Record<string, unknown>)
          : {},
      outputSchema:
        operation.outputSchema && typeof operation.outputSchema === "object"
          ? (operation.outputSchema as Record<string, unknown>)
          : {},
    };
  });

  const dataEvolution = Array.isArray(raw.dataEvolution)
    ? textList(raw.dataEvolution)
    : raw.dataEvolution && typeof raw.dataEvolution === "object"
      ? list((raw.dataEvolution as Record<string, unknown>).stages).map(
          (value) => {
            const stage = value as Record<string, unknown>;
            return [stage.phase, stage.behavior].filter(Boolean).join("：");
          },
        )
      : [];

  const normalized = {
    blueprintVersion: 1,
    runtimeType:
      raw.runtimeType === "STATIC" || raw.runtimeType === "GO"
        ? raw.runtimeType
        : entities.length === 0 && operations.length === 0
          ? "STATIC"
          : "GO",
    product: {
      name: String(rawProduct.name || requirement?.name || "内部轻应用"),
      goal: String(rawProduct.goal || rawProduct.description || requirement?.goal || "解决业务问题"),
      actors:
        textList(rawProduct.actors).length > 0
          ? textList(rawProduct.actors)
          : textList(rawProduct.targetActors).length > 0
            ? textList(rawProduct.targetActors)
            : requirement?.actors || ["业务用户"],
      workflows:
        textList(rawProduct.workflows).length > 0
          ? textList(rawProduct.workflows)
          : requirement?.workflows || ["完成核心业务流程"],
      acceptanceCriteria:
        textList(rawProduct.acceptanceCriteria).length > 0
          ? textList(rawProduct.acceptanceCriteria)
          : requirement?.acceptanceCriteria || ["核心流程可完成"],
    },
    pages,
    entities,
    operations,
    businessRules: list(raw.businessRules).map((value, index) => {
      const rule = value as Record<string, unknown>;
      return {
        id: String(rule.id || `rule_${index + 1}`),
        description: String(rule.description || rule.name || `业务规则 ${index + 1}`),
        enforcedBy:
          rule.enforcedBy === "database" ? "database" : "backend",
      };
    }),
    dataEvolution,
    testScenarios: list(raw.testScenarios).map((value, index) => {
      const scenario = value as Record<string, unknown>;
      return {
        id: String(scenario.id || `scenario_${index + 1}`),
        description: String(scenario.description || scenario.name || `验收场景 ${index + 1}`),
        expected: String(scenario.expected || scenario.expectedResult || "场景通过"),
      };
    }),
  };

  return appBlueprintSchema.parse(normalized);
}

export function businessBlueprintIssues(blueprint: AppBlueprint, requirement: RequirementSpec) {
  const issues: string[] = [];
  // outOfScope explicitly describes things we must not build, so it must not
  // count as evidence that a capability was requested.
  const requirementText = JSON.stringify({
    goal: requirement.goal,
    workflows: requirement.workflows,
    entities: requirement.entities,
    businessRules: requirement.businessRules,
    acceptanceCriteria: requirement.acceptanceCriteria,
  }).toLowerCase();
  const operationIds = new Set(blueprint.operations.map((operation) => operation.id));
  for (const page of blueprint.pages) {
    for (const operationId of page.operations) {
      if (!operationIds.has(operationId)) issues.push(`页面 ${page.title} 引用了不存在的操作 ${operationId}`);
    }
  }

  if (blueprint.runtimeType === "STATIC" && (blueprint.entities.length > 0 || blueprint.operations.length > 0)) {
    issues.push("STATIC 应用不应生成服务端实体或 API 操作");
  }

  const restrictedPages = /(权限|组织|审批|系统设置|角色管理|登录|permission|organization|approval|settings|login)/i;
  const requestedRestrictedScope = /(权限|组织|审批|系统设置|角色管理|登录|permission|organization|approval|settings|login)/i.test(requirementText);
  if (!requestedRestrictedScope) {
    for (const page of blueprint.pages) {
      if (restrictedPages.test(`${page.id} ${page.title}`)) issues.push(`页面 ${page.title} 超出了第一版业务范围`);
    }
  }

  const asksForAnalytics = /(统计|分析|趋势|指标|看板|报表|analytics|dashboard|report|metric)/i.test(requirementText);
  if (!asksForAnalytics) {
    for (const page of blueprint.pages) {
      if (/(统计|分析|趋势|指标|看板|报表|analytics|dashboard|report|metric)/i.test(`${page.id} ${page.title}`)) {
        issues.push(`页面 ${page.title} 没有对应的统计或分析需求`);
      }
    }
  }
  return issues;
}

export async function intentRouter(state: AgentState, config?: { configurable?: { model?: string } }): Promise<Partial<AgentState>> {
  const lastHuman = [...state.messages].reverse().find((message) => message._getType() === "human");
  const lastHumanText = textContent(lastHuman?.content);
  const requirement = state.requirementSpec ?? requirementFromMessages(state);
  if (delegatesBusinessDefaults(lastHumanText)) {
    return { intentResult: { intent: "CREATE_APP", confidence: 1, requiresClarification: false, reason: "用户授权采用合理默认值并直接生成", requestedCapabilities: [] } };
  }
  if (requirement && isProceedCommand(lastHumanText)) {
    return { intentResult: { intent: "CREATE_APP", confidence: 1, requiresClarification: false, reason: "用户确认已有需求规格", requestedCapabilities: [] } };
  }
  const response = await modelFor(config).invoke([new SystemMessage(INTENT_ROUTER_PROMPT), ...state.messages]);
  try {
    return { intentResult: intentResultSchema.parse(taggedJson(textContent(response.content), "intentResult")) };
  } catch {
    return { intentResult: { intent: "UNSUPPORTED", confidence: 0, requiresClarification: true, reason: "无法可靠识别当前意图", requestedCapabilities: [] } };
  }
}

export async function directResponder(state: AgentState, config?: { configurable?: { model?: string } }): Promise<Partial<AgentState>> {
  const response = await modelFor(config).invoke([
    new SystemMessage(`你是内部轻应用构建平台助手。当前意图是 ${state.intentResult?.intent || "UNKNOWN"}。自然、简洁地回答用户；不要生成代码或虚构已执行的发布操作。`),
    ...state.messages,
  ]);
  return { messages: [response] };
}

export async function businessAnalyst(state: AgentState, config?: { configurable?: { model?: string } }): Promise<Partial<AgentState>> {
  const lastHuman = [...state.messages].reverse().find((message) => message._getType() === "human");
  const lastText = textContent(lastHuman?.content);
  const delegatedDefaults = delegatesBusinessDefaults(lastText);
  const recoveredRequirement = state.requirementSpec ?? requirementFromMessages(state);
  if ((isProceedCommand(lastText) || delegatedDefaults) && recoveredRequirement) {
    return { requirementSpec: { ...recoveredRequirement, confirmed: true } };
  }
  const existing = recoveredRequirement ? `\n已有规格：${JSON.stringify(recoveredRequirement)}` : "";
  const delegatedInstruction = delegatedDefaults
    ? "\n用户已明确授权你采用合理默认值。本轮禁止继续提问，必须只输出 requirementSpec，并将 confirmed 设为 true。"
    : "";
  const model = modelFor(config);
  let response = await model.invoke([new SystemMessage(BUSINESS_ANALYST_PROMPT + existing + delegatedInstruction), ...state.messages]);
  if (delegatedDefaults && !textContent(response.content).includes("<requirementSpec>")) {
    response = await model.invoke([
      new SystemMessage(BUSINESS_ANALYST_PROMPT + existing),
      ...state.messages,
      new SystemMessage("用户已授权采用合理默认值。不要解释、不要提问，只输出 <requirementSpec>JSON</requirementSpec>，confirmed 必须为 true。"),
    ]);
  }
  const content = textContent(response.content);
  try {
    const raw = taggedJson(content, "requirementSpec") as Record<string, unknown> | undefined;
    if (!raw) throw new Error("missing requirementSpec");
    let requirementSpec: RequirementSpec;
    try { requirementSpec = requirementSpecSchema.parse(raw); }
    catch { requirementSpec = normalizeRequirementSpec(raw); }
    if (delegatedDefaults) requirementSpec = { ...requirementSpec, confirmed: true };
    return { messages: [new AIMessage(content)], requirementSpec };
  } catch {
    return { messages: [new AIMessage(content)] };
  }
}

export async function solutionArchitect(state: AgentState, config?: { configurable?: { model?: string } }): Promise<Partial<AgentState>> {
  const requirement = state.requirementSpec;
  if (!requirement) throw new Error("需求方向尚未收敛");
  const systemPrompt = `${SOLUTION_ARCHITECT_PROMPT}\nRequirementSpec:\n${JSON.stringify(requirement)}`;
  const model = modelFor(config);
  let response = await model.invoke([new SystemMessage(systemPrompt)]);
  const parseBlueprint = (value: unknown) => {
    const content = textContent(value);
    const raw = taggedJson(content, "appBlueprint") as Record<string, unknown> | undefined;
    if (!raw) throw new Error("应用蓝图格式缺失，请重新生成");
    try { return { content, blueprint: appBlueprintSchema.parse(raw) }; }
    catch { return { content, blueprint: normalizeAppBlueprint(raw, requirement) }; }
  };
  let parsed = parseBlueprint(response.content);
  const issues = businessBlueprintIssues(parsed.blueprint, requirement);
  if (issues.length) {
    response = await model.invoke([
      new SystemMessage(systemPrompt),
      new SystemMessage(`上一版方案偏离最小业务闭环。请修正以下问题，只输出完整 appBlueprint：\n${issues.join("\n")}`),
    ]);
    parsed = parseBlueprint(response.content);
  }
  const { content, blueprint: appBlueprint } = parsed;
  return { messages: [new AIMessage(content)], appBlueprint };
}
