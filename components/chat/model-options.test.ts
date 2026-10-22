import assert from "node:assert/strict";
import test from "node:test";

import { CHAT_MODEL_OPTIONS } from "./model-options";

test("chat model selector exposes the enabled Qwen model codes", () => {
  const ids = CHAT_MODEL_OPTIONS.map((model) => model.id);

  assert.deepEqual(ids, [
    "qwen3.7-flash-2026-07-15",
    "qwen3.8-max-0902",
    "qwen3.7-flash",
    "deepseek-v4-flash-0731",
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test("similar Qwen Flash variants have distinct labels", () => {
  const labels = CHAT_MODEL_OPTIONS.map((model) => model.name);

  assert.equal(new Set(labels).size, labels.length);
});
