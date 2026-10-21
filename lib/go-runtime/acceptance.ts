import { acceptanceScenarioSuiteSchema } from "@/lib/app-contracts";

type InvocationResult = { status: number; body: unknown };
type InvokeOperation = (operationId: string, input: Record<string, unknown>) => Promise<InvocationResult>;

function interpolate(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === "string") {
    return Object.entries(variables).reduce((result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement), value);
  }
  if (Array.isArray(value)) return value.map((entry) => interpolate(entry, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, interpolate(entry, variables)]));
  }
  return value;
}

function readPath(value: unknown, path: string): unknown {
  const normalizedPath = path === "$" ? "" : path.startsWith("$.") ? path.slice(2) : path;
  if (!normalizedPath) return value;
  return normalizedPath.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
    if (current && typeof current === "object") return (current as Record<string, unknown>)[segment];
    return undefined;
  }, value);
}

function assertValue(actual: unknown, operator: "equals" | "gte" | "lte" | "nonEmpty", expected: unknown) {
  if (operator === "equals" && !Object.is(actual, expected)) return false;
  if (operator === "gte" && !(typeof actual === "number" && typeof expected === "number" && actual >= expected)) return false;
  if (operator === "lte" && !(typeof actual === "number" && typeof expected === "number" && actual <= expected)) return false;
  if (operator === "nonEmpty" && (actual == null || actual === "" || (Array.isArray(actual) && actual.length === 0))) return false;
  return true;
}

export async function runAcceptanceScenarios(raw: string, invoke: InvokeOperation, variables: Record<string, string> = {}) {
  const suite = acceptanceScenarioSuiteSchema.parse(JSON.parse(raw));
  let stepCount = 0;
  for (const scenario of suite.scenarios) {
    for (const step of scenario.steps) {
      stepCount += 1;
      const input = interpolate(step.input, variables) as Record<string, unknown>;
      const result = await invoke(step.operationId, input);
      if (result.status !== step.expectStatus) {
        const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
        throw new Error(`验收场景 ${scenario.id} 的 ${step.operationId} 返回 ${result.status}，预期 ${step.expectStatus}；响应：${body.slice(0, 1000)}`);
      }
      for (const assertion of step.assertions) {
        const actual = readPath(result.body, assertion.path);
        if (!assertValue(actual, assertion.operator, assertion.value)) {
          const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
          throw new Error(`验收场景 ${scenario.id} 断言失败: ${assertion.path} ${assertion.operator}；响应：${body.slice(0, 1000)}`);
        }
      }
    }
  }
  return { scenarioCount: suite.scenarios.length, stepCount };
}
