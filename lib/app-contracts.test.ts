import test from "node:test";
import assert from "node:assert/strict";
import { appBlueprintSchema, intentResultSchema, runtimeManifestSchema } from "./app-contracts";

test("accepts a complete application contract", () => {
  const operation = { id: "work_logs.list", method: "GET" as const, path: "/api/work-logs", description: "查询工时", inputSchema: {}, outputSchema: {} };
  assert.equal(intentResultSchema.parse({ intent: "CREATE_APP", confidence: 0.9, requiresClarification: true, reason: "new app", requestedCapabilities: [] }).intent, "CREATE_APP");
  assert.equal(appBlueprintSchema.parse({
    blueprintVersion: 1,
    product: { name: "分镜产能", goal: "统计产能", actors: ["负责人"], workflows: ["录入工时"], acceptanceCriteria: ["可查看图表"] },
    pages: [{ id: "dashboard", title: "看板", route: "/", operations: [operation.id] }],
    entities: [{ id: "workLog", table: "work_logs", description: "工时", fields: [{ name: "hours", type: "number", required: true }] }],
    operations: [operation], businessRules: [], dataEvolution: [],
    testScenarios: [{ id: "list", description: "查询", expected: "返回数据" }],
  }).operations[0].id, operation.id);
  assert.equal(runtimeManifestSchema.parse({ runtimeVersion: "go-1.24", operations: [operation] }).runtimeVersion, "go-1.24");
});

test("rejects unstable operation ids", () => {
  assert.throws(() => appBlueprintSchema.parse({ blueprintVersion: 1, product: {}, pages: [], entities: [], operations: [{ id: "List Work Logs" }], testScenarios: [] }));
});
