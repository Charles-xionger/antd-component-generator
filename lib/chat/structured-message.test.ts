import assert from "node:assert/strict";
import test from "node:test";
import {
  detectStructuredMessageKind,
  parseStructuredMessage,
} from "./structured-message";

test("parses a requirement spec and preserves surrounding text", () => {
  const result = parseStructuredMessage(
    '需求如下：<requirementSpec>{"name":"工时统计","goal":"统计产能","actors":["员工"],"workflows":["填报"],"acceptanceCriteria":["可查询"],"confirmed":false}</requirementSpec>请回复确认开发。',
  );
  assert.equal(result?.kind, "requirement");
  assert.equal(result?.data.name, "工时统计");
  assert.equal(result?.before, "需求如下：");
  assert.equal(result?.after, "请回复确认开发。");
});

test("parses an app blueprint wrapped in a json fence", () => {
  const result = parseStructuredMessage(
    '<appBlueprint>```json\n{"blueprintVersion":1,"product":{"name":"工时统计"},"pages":[],"entities":[],"operations":[],"testScenarios":[]}\n```</appBlueprint>',
  );
  assert.equal(result?.kind, "blueprint");
  assert.equal(result?.data.blueprintVersion, 1);
});

test("does not treat ordinary chat as a structured message", () => {
  assert.equal(parseStructuredMessage("请补充工时计算规则。"), undefined);
});

test("detects a streaming structured message before the closing tag", () => {
  assert.equal(
    detectStructuredMessageKind('<appBlueprint>{"blueprintVersion":'),
    "blueprint",
  );
});
