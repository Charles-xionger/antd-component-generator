import assert from "node:assert/strict";
import test from "node:test";
import { parseDataManifest } from "./manifest";

function manifest(fields: unknown[]) {
  return {
    manifestVersion: 1,
    collections: [{ key: "customers", name: "客户", fields }],
  };
}

test("accepts a valid version 1 manifest", () => {
  const parsed = parseDataManifest(
    manifest([
      { key: "name", label: "姓名", type: "string", required: true },
      {
        key: "level",
        label: "等级",
        type: "enum",
        required: false,
        options: ["A", "B"],
        defaultValue: "A",
      },
    ]),
  );
  assert.equal(parsed.collections[0].key, "customers");
});

test("rejects duplicate collection and field keys", () => {
  assert.throws(() =>
    parseDataManifest({
      manifestVersion: 1,
      collections: [
        {
          key: "customers",
          name: "客户一",
          fields: [
            { key: "name", label: "姓名", type: "string", required: true },
            { key: "name", label: "名称", type: "string", required: false },
          ],
        },
        { key: "customers", name: "客户二", fields: [] },
      ],
    }),
  );
});

test("rejects reserved keys and invalid enum definitions", () => {
  assert.throws(() =>
    parseDataManifest(
      manifest([
        { key: "id", label: "ID", type: "string", required: true },
        { key: "state", label: "状态", type: "enum", required: false },
      ]),
    ),
  );
});

test("rejects a default value that does not match the field type", () => {
  assert.throws(() =>
    parseDataManifest(
      manifest([
        {
          key: "amount",
          label: "金额",
          type: "number",
          required: false,
          defaultValue: "10",
        },
      ]),
    ),
  );
});
