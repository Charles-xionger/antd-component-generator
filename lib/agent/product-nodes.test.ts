import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { businessAnalyst, businessBlueprintIssues, delegatesBusinessDefaults, intentRouter, normalizeAppBlueprint, normalizeRequirementSpec } from "./product-nodes";
import type { AgentState } from "./state";

test("normalizes object-shaped requirement lists without losing workflow context", () => {
  const requirement = normalizeRequirementSpec({
    name: "产品展示网格",
    goal: "展示产品",
    actors: ["浏览者", { name: "内容管理员", description: "维护数据" }],
    workflows: [{ name: "产品浏览", steps: ["进入页面", "查看详情"] }],
    entities: [{ name: "产品" }],
    businessRules: [{ id: "rating", description: "评分为 1 到 5 星" }],
    acceptanceCriteria: [{ description: "移动端每行展示一张卡片" }],
    confirmed: false,
  });

  assert.deepEqual(requirement.actors, ["浏览者", "内容管理员"]);
  assert.deepEqual(requirement.workflows, ["产品浏览：进入页面 → 查看详情"]);
  assert.deepEqual(requirement.businessRules, ["评分为 1 到 5 星"]);
  assert.equal(requirement.confirmed, false);
});

test("recognizes explicit authorization to choose business defaults", () => {
  assert.equal(delegatesBusinessDefaults("直接生成一个版本"), true);
  assert.equal(delegatesBusinessDefaults("你自己决定，先出一版"), true);
  assert.equal(delegatesBusinessDefaults("按合理默认值先做出来"), true);
  assert.equal(delegatesBusinessDefaults("所有登录用户，支持所有操作"), false);
});

test("routes direct-generation requests into app creation without an existing spec", async () => {
  const state = { messages: [new HumanMessage("直接生成一个版本")] } as AgentState;
  const routed = await intentRouter(state);
  assert.equal(routed.intentResult?.intent, "CREATE_APP");
  assert.equal(routed.intentResult?.requiresClarification, false);
});

test("recovers a displayed requirement card and accepts natural confirmation wording", async () => {
  const state = {
    messages: [
      new AIMessage(`<requirementSpec>${JSON.stringify({
        name: "产品展示网格",
        goal: "展示产品",
        actors: ["浏览者"],
        workflows: [{ name: "浏览", steps: ["进入页面", "查看产品"] }],
        entities: ["产品"],
        businessRules: [],
        outOfScope: [],
        acceptanceCriteria: ["响应式展示"],
        confirmed: false,
      })}</requirementSpec>`),
      new HumanMessage("确认开始开发"),
    ],
  } as AgentState;

  const routed = await intentRouter(state);
  assert.equal(routed.intentResult?.intent, "CREATE_APP");
  const analyzed = await businessAnalyst(state);
  assert.equal(analyzed.requirementSpec?.confirmed, true);
  assert.deepEqual(analyzed.requirementSpec?.workflows, ["浏览：进入页面 → 查看产品"]);
  assert.equal(analyzed.messages, undefined);
});

test("normalizes the alternate blueprint shape emitted by compatible models", () => {
  const blueprint = normalizeAppBlueprint(
    {
      blueprintVersion: 1,
      product: {
        name: "短剧工时统计",
        description: "统计制作团队产能",
        targetActors: ["分镜师", "剪辑师"],
      },
      pages: [{ id: "page_dashboard", name: "产能看板" }],
      entities: [
        {
          id: "time_record",
          name: "工时记录",
          columns: [
            { name: "id", type: "SERIAL PRIMARY KEY" },
            { name: "hours", type: "DECIMAL(10,2) NOT NULL" },
          ],
        },
      ],
      operations: [
        {
          id: "time_record.update",
          method: "PUT",
          path: "/api/time-records",
          inputSchema: {},
          outputSchema: {},
        },
      ],
      businessRules: [{ id: "hours_positive", description: "工时必须为正数" }],
      dataEvolution: {
        stages: [{ phase: "采集", behavior: "员工提交后入库" }],
      },
      testScenarios: [
        {
          id: "record_hours",
          description: "录入工时",
          expectedResult: "保存成功",
        },
      ],
    },
    {
      name: "短剧工时统计",
      goal: "统计制作团队产能",
      actors: ["员工"],
      workflows: ["录入工时"],
      entities: [],
      businessRules: [],
      outOfScope: [],
      acceptanceCriteria: ["可录入并查询"],
      confirmed: true,
    },
  );

  assert.equal(blueprint.pages[0].title, "产能看板");
  assert.equal(blueprint.entities[0].fields[1].type, "number");
  assert.equal(blueprint.operations[0].method, "PATCH");
  assert.equal(blueprint.runtimeType, "GO");
  assert.equal(blueprint.businessRules[0].enforcedBy, "backend");
  assert.equal(blueprint.testScenarios[0].expected, "保存成功");
});

test("selects the static runtime for a value loop without persistence or server operations", () => {
  const blueprint = normalizeAppBlueprint({
    blueprintVersion: 1,
    product: {
      name: "文本格式化",
      goal: "把粘贴的文本整理为统一格式",
      actors: ["业务人员"],
      workflows: ["粘贴文本并得到结果"],
      acceptanceCriteria: ["可以复制格式化结果"],
    },
    pages: [{ id: "formatter", title: "文本格式化", route: "/", operations: [] }],
    entities: [],
    operations: [],
    testScenarios: [],
  });
  assert.equal(blueprint.runtimeType, "STATIC");
});

test("flags unrequested dashboards and administration scope", () => {
  const requirement = normalizeRequirementSpec({
    name: "客户名单",
    goal: "维护客户联系方式",
    actors: ["销售"],
    workflows: ["添加并查找客户"],
    outOfScope: ["暂不提供登录和复杂权限"],
    acceptanceCriteria: ["可以新增和搜索客户"],
    confirmed: true,
  });
  const blueprint = normalizeAppBlueprint({
    blueprintVersion: 1,
    runtimeType: "GO",
    product: { name: "客户名单", goal: "维护客户联系方式", actors: ["销售"], workflows: ["添加客户"], acceptanceCriteria: ["可以新增"] },
    pages: [
      { id: "customers", title: "客户名单", route: "/", operations: ["customer.create"] },
      { id: "dashboard", title: "经营看板", route: "/dashboard", operations: [] },
      { id: "permissions", title: "权限设置", route: "/permissions", operations: [] },
    ],
    entities: [{ id: "customer", table: "customers", description: "客户", fields: [{ name: "id", type: "uuid", required: true }] }],
    operations: [{ id: "customer.create", method: "POST", path: "/api/customers", description: "添加客户", inputSchema: {}, outputSchema: {} }],
    testScenarios: [{ id: "create", description: "添加客户", expected: "添加成功" }],
  }, requirement);
  const issues = businessBlueprintIssues(blueprint, requirement);
  assert.ok(issues.some((issue) => issue.includes("经营看板")));
  assert.ok(issues.some((issue) => issue.includes("权限设置")));
});
