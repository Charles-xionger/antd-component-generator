import type {
  DataCollectionDefinition,
  DataFieldDefinition,
  DataManifest,
} from "./manifest";

export type SchemaChangeKind =
  | "ADD_COLLECTION"
  | "REMOVE_COLLECTION"
  | "RENAME_COLLECTION_KEY"
  | "UPDATE_COLLECTION_NAME"
  | "ADD_FIELD"
  | "REMOVE_FIELD"
  | "RENAME_FIELD_KEY"
  | "UPDATE_FIELD_LABEL"
  | "CHANGE_FIELD_TYPE"
  | "MAKE_FIELD_REQUIRED"
  | "MAKE_FIELD_OPTIONAL"
  | "UPDATE_FIELD_DEFAULT"
  | "ADD_ENUM_OPTION"
  | "REMOVE_ENUM_OPTION";

export interface SchemaChange {
  kind: SchemaChangeKind;
  collectionKey: string;
  fieldKey?: string;
  before?: unknown;
  after?: unknown;
  reason: string;
}

export interface SchemaDiffResult {
  safeChanges: SchemaChange[];
  dangerousChanges: SchemaChange[];
  unchangedCollections: string[];
  hasChanges: boolean;
}

function hasDefault(field: DataFieldDefinition) {
  return Object.hasOwn(field, "defaultValue");
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function findCollection(
  collections: DataCollectionDefinition[],
  current: DataCollectionDefinition,
) {
  return collections.find((candidate) =>
    current.id && candidate.id
      ? current.id === candidate.id
      : current.key === candidate.key,
  );
}

function findField(
  fields: DataFieldDefinition[],
  current: DataFieldDefinition,
) {
  return fields.find((candidate) =>
    current.id && candidate.id
      ? current.id === candidate.id
      : current.key === candidate.key,
  );
}

function compareField(
  collectionKey: string,
  current: DataFieldDefinition,
  next: DataFieldDefinition,
  safeChanges: SchemaChange[],
  dangerousChanges: SchemaChange[],
) {
  if (current.key !== next.key) {
    dangerousChanges.push({
      kind: "RENAME_FIELD_KEY",
      collectionKey,
      fieldKey: current.key,
      before: current.key,
      after: next.key,
      reason: "字段 key 变更需要显式数据迁移",
    });
  }
  if (current.label !== next.label) {
    safeChanges.push({
      kind: "UPDATE_FIELD_LABEL",
      collectionKey,
      fieldKey: next.key,
      before: current.label,
      after: next.label,
      reason: "显示名称变化不修改现有记录",
    });
  }
  if (current.type !== next.type) {
    dangerousChanges.push({
      kind: "CHANGE_FIELD_TYPE",
      collectionKey,
      fieldKey: next.key,
      before: current.type,
      after: next.type,
      reason: "字段类型变化可能使历史数据失效",
    });
  }
  if (!current.required && next.required) {
    dangerousChanges.push({
      kind: "MAKE_FIELD_REQUIRED",
      collectionKey,
      fieldKey: next.key,
      before: false,
      after: true,
      reason: "收紧必填约束需要回填历史记录",
    });
  } else if (current.required && !next.required) {
    safeChanges.push({
      kind: "MAKE_FIELD_OPTIONAL",
      collectionKey,
      fieldKey: next.key,
      before: true,
      after: false,
      reason: "放宽必填约束向后兼容",
    });
  }
  if (!sameValue(current.defaultValue, next.defaultValue)) {
    safeChanges.push({
      kind: "UPDATE_FIELD_DEFAULT",
      collectionKey,
      fieldKey: next.key,
      before: current.defaultValue,
      after: next.defaultValue,
      reason: "默认值只影响后续写入，不覆盖历史记录",
    });
  }
  if (current.type === "enum" && next.type === "enum") {
    const currentOptions = new Set(current.options || []);
    const nextOptions = new Set(next.options || []);
    for (const option of nextOptions) {
      if (!currentOptions.has(option)) {
        safeChanges.push({
          kind: "ADD_ENUM_OPTION",
          collectionKey,
          fieldKey: next.key,
          after: option,
          reason: "新增枚举选项不影响历史记录",
        });
      }
    }
    for (const option of currentOptions) {
      if (!nextOptions.has(option)) {
        dangerousChanges.push({
          kind: "REMOVE_ENUM_OPTION",
          collectionKey,
          fieldKey: next.key,
          before: option,
          reason: "删除枚举选项可能使历史记录失效",
        });
      }
    }
  }
}

export function diffDataManifests(
  current: DataManifest,
  next: DataManifest,
): SchemaDiffResult {
  const safeChanges: SchemaChange[] = [];
  const dangerousChanges: SchemaChange[] = [];
  const changedCollections = new Set<string>();

  for (const nextCollection of next.collections) {
    const currentCollection = findCollection(current.collections, nextCollection);
    if (!currentCollection) {
      safeChanges.push({
        kind: "ADD_COLLECTION",
        collectionKey: nextCollection.key,
        after: nextCollection,
        reason: "新增集合尚无历史记录",
      });
      changedCollections.add(nextCollection.key);
      continue;
    }

    if (currentCollection.key !== nextCollection.key) {
      dangerousChanges.push({
        kind: "RENAME_COLLECTION_KEY",
        collectionKey: currentCollection.key,
        before: currentCollection.key,
        after: nextCollection.key,
        reason: "集合 key 变更会改变 Runtime API 地址",
      });
      changedCollections.add(currentCollection.key);
    }
    if (currentCollection.name !== nextCollection.name) {
      safeChanges.push({
        kind: "UPDATE_COLLECTION_NAME",
        collectionKey: nextCollection.key,
        before: currentCollection.name,
        after: nextCollection.name,
        reason: "集合显示名称变化不修改现有记录",
      });
      changedCollections.add(nextCollection.key);
    }

    for (const nextField of nextCollection.fields) {
      const currentField = findField(currentCollection.fields, nextField);
      if (!currentField) {
        const change: SchemaChange = {
          kind: "ADD_FIELD",
          collectionKey: nextCollection.key,
          fieldKey: nextField.key,
          after: nextField,
          reason:
            nextField.required && !hasDefault(nextField)
              ? "新增必填字段缺少默认值，需要回填历史记录"
              : "新增字段向后兼容",
        };
        if (nextField.required && !hasDefault(nextField)) {
          dangerousChanges.push(change);
        } else {
          safeChanges.push(change);
        }
        changedCollections.add(nextCollection.key);
        continue;
      }
      const safeBefore = safeChanges.length;
      const dangerousBefore = dangerousChanges.length;
      compareField(
        nextCollection.key,
        currentField,
        nextField,
        safeChanges,
        dangerousChanges,
      );
      if (
        safeBefore !== safeChanges.length ||
        dangerousBefore !== dangerousChanges.length
      ) {
        changedCollections.add(nextCollection.key);
      }
    }

    for (const currentField of currentCollection.fields) {
      if (!findField(nextCollection.fields, currentField)) {
        dangerousChanges.push({
          kind: "REMOVE_FIELD",
          collectionKey: currentCollection.key,
          fieldKey: currentField.key,
          before: currentField,
          reason: "删除字段会使历史数据不可访问",
        });
        changedCollections.add(currentCollection.key);
      }
    }
  }

  for (const currentCollection of current.collections) {
    if (!findCollection(next.collections, currentCollection)) {
      dangerousChanges.push({
        kind: "REMOVE_COLLECTION",
        collectionKey: currentCollection.key,
        before: currentCollection,
        reason: "删除集合会隐藏全部历史记录",
      });
      changedCollections.add(currentCollection.key);
    }
  }

  const unchangedCollections = next.collections
    .map((collection) => collection.key)
    .filter((key) => !changedCollections.has(key));

  return {
    safeChanges,
    dangerousChanges,
    unchangedCollections,
    hasChanges: safeChanges.length > 0 || dangerousChanges.length > 0,
  };
}

