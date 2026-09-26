import assert from "node:assert/strict";
import test from "node:test";
import type { DataManifest } from "./manifest";
import { diffDataManifests } from "./schema-diff";

const base: DataManifest = {
  manifestVersion: 1,
  collections: [
    {
      id: "collection_customers",
      key: "customers",
      name: "客户",
      fields: [
        {
          id: "field_name",
          key: "name",
          label: "姓名",
          type: "string",
          required: true,
        },
        {
          id: "field_level",
          key: "level",
          label: "等级",
          type: "enum",
          required: false,
          options: ["A", "B"],
        },
      ],
    },
  ],
};

function nextWithFields(fields: DataManifest["collections"][number]["fields"]) {
  return {
    ...base,
    collections: [{ ...base.collections[0], fields }],
  } satisfies DataManifest;
}

test("reports an unchanged manifest", () => {
  const result = diffDataManifests(base, structuredClone(base));
  assert.equal(result.hasChanges, false);
  assert.deepEqual(result.unchangedCollections, ["customers"]);
});

test("treats optional or defaulted fields as safe", () => {
  const result = diffDataManifests(
    base,
    nextWithFields([
      ...base.collections[0].fields,
      { key: "note", label: "备注", type: "string", required: false },
      {
        key: "enabled",
        label: "启用",
        type: "boolean",
        required: true,
        defaultValue: true,
      },
    ]),
  );
  assert.deepEqual(result.safeChanges.map((change) => change.kind), [
    "ADD_FIELD",
    "ADD_FIELD",
  ]);
  assert.equal(result.dangerousChanges.length, 0);
});

test("marks required fields without defaults as dangerous", () => {
  const result = diffDataManifests(
    base,
    nextWithFields([
      ...base.collections[0].fields,
      { key: "phone", label: "电话", type: "string", required: true },
    ]),
  );
  assert.equal(result.dangerousChanges[0]?.kind, "ADD_FIELD");
});

test("marks type changes, removals and removed enum options as dangerous", () => {
  const changed = structuredClone(base);
  changed.collections[0].fields = [
    { ...base.collections[0].fields[0], type: "number" },
    { ...base.collections[0].fields[1], options: ["A"] },
  ];
  const result = diffDataManifests(base, changed);
  assert.deepEqual(
    result.dangerousChanges.map((change) => change.kind),
    ["CHANGE_FIELD_TYPE", "REMOVE_ENUM_OPTION"],
  );

  const removed = diffDataManifests(
    base,
    nextWithFields([base.collections[0].fields[0]]),
  );
  assert.equal(removed.dangerousChanges[0]?.kind, "REMOVE_FIELD");
});
