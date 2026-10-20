import assert from "node:assert/strict";
import test from "node:test";
import { runAcceptanceScenarios } from "./acceptance";

test("runs ordered API acceptance steps and assertions", async () => {
  const calls: string[] = [];
  const result = await runAcceptanceScenarios(JSON.stringify({ scenarios: [{
    id: "worklog.flow",
    description: "record and aggregate work",
    steps: [{ operationId: "worklog.create", input: { hours: 4 }, expectStatus: 200 }, {
      operationId: "dashboard.query", input: {}, expectStatus: 200,
      assertions: [{ path: "metrics.totalHours", operator: "equals", value: 4 }, { path: "byPerson", operator: "nonEmpty" }],
    }],
  }] }), async (operationId) => {
    calls.push(operationId);
    return operationId === "dashboard.query"
      ? { status: 200, body: { metrics: { totalHours: 4 }, byPerson: [{ name: "阿杰" }] } }
      : { status: 200, body: { id: "log-1" } };
  });
  assert.deepEqual(calls, ["worklog.create", "dashboard.query"]);
  assert.deepEqual(result, { scenarioCount: 1, stepCount: 2 });
});

test("supports JSONPath-style root prefixes emitted by generated scenarios", async () => {
  const result = await runAcceptanceScenarios(JSON.stringify({ scenarios: [{
    id: "response.status",
    description: "checks an operation envelope",
    steps: [{
      operationId: "worklog.create",
      input: {},
      expectStatus: 200,
      assertions: [{ path: "$.status", operator: "equals", value: "success" }],
    }],
  }] }), async () => ({ status: 200, body: { status: "success" } }));
  assert.equal(result.stepCount, 1);
});

test("reports a failed business assertion", async () => {
  await assert.rejects(() => runAcceptanceScenarios(JSON.stringify({ scenarios: [{
    id: "capacity.zero",
    description: "zero hours is safe",
    steps: [{ operationId: "dashboard.query", input: {}, assertions: [{ path: "metrics.perHour", operator: "equals", value: 0 }] }],
  }] }), async () => ({ status: 200, body: { metrics: { perHour: null } } })), /断言失败/);
});

test("includes the response body when an acceptance status fails", async () => {
  await assert.rejects(() => runAcceptanceScenarios(JSON.stringify({ scenarios: [{
    id: "user.create",
    description: "create a user",
    steps: [{ operationId: "user.create", input: {}, expectStatus: 200 }],
  }] }), async () => ({ status: 400, body: { error: "name is required" } })), /name is required/);
});
