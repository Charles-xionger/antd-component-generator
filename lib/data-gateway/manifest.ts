import { z } from "zod";

export const DATA_FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "json",
] as const;

const identifierPattern = /^[a-z][a-z0-9_]{0,62}$/;
const stableIdPattern = /^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/;
const reservedFieldKeys = new Set([
  "id",
  "project_id",
  "collection_id",
  "environment",
  "record_version",
  "created_at",
  "updated_at",
  "deleted_at",
]);
const reservedCollectionKeys = new Set(["api", "runtime", "system"]);

function isValidDefaultValue(
  field: z.infer<typeof dataFieldDefinitionSchema>,
) {
  if (!Object.hasOwn(field, "defaultValue")) return true;
  const value = field.defaultValue;
  if (value === null) return !field.required;

  switch (field.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      );
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "enum":
      return typeof value === "string" && Boolean(field.options?.includes(value));
    case "json":
      return typeof value === "object";
  }
}

export const dataFieldDefinitionSchema = z
  .object({
    id: z.string().regex(stableIdPattern).optional(),
    key: z.string().regex(identifierPattern),
    label: z.string().trim().min(1).max(80),
    type: z.enum(DATA_FIELD_TYPES),
    required: z.boolean(),
    defaultValue: z.unknown().optional(),
    options: z.array(z.string().trim().min(1).max(80)).min(1).max(100).optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (reservedFieldKeys.has(field.key)) {
      context.addIssue({
        code: "custom",
        path: ["key"],
        message: `字段 key ${field.key} 为系统保留名称`,
      });
    }
    if (field.type === "enum") {
      if (!field.options) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "enum 字段必须提供 options",
        });
      } else if (new Set(field.options).size !== field.options.length) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "enum options 不能重复",
        });
      }
    } else if (field.options) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "只有 enum 字段可以提供 options",
      });
    }
    if (!isValidDefaultValue(field)) {
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "defaultValue 与字段类型不匹配",
      });
    }
  });

export const dataCollectionDefinitionSchema = z
  .object({
    id: z.string().regex(stableIdPattern).optional(),
    key: z.string().regex(identifierPattern),
    name: z.string().trim().min(1).max(80),
    fields: z.array(dataFieldDefinitionSchema).max(100),
  })
  .strict()
  .superRefine((collection, context) => {
    if (reservedCollectionKeys.has(collection.key)) {
      context.addIssue({
        code: "custom",
        path: ["key"],
        message: `集合 key ${collection.key} 为系统保留名称`,
      });
    }
    const keys = new Set<string>();
    const ids = new Set<string>();
    collection.fields.forEach((field, index) => {
      if (keys.has(field.key)) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: `字段 key ${field.key} 重复`,
        });
      }
      keys.add(field.key);
      if (field.id) {
        if (ids.has(field.id)) {
          context.addIssue({
            code: "custom",
            path: ["fields", index, "id"],
            message: `字段 id ${field.id} 重复`,
          });
        }
        ids.add(field.id);
      }
    });
  });

export const dataManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    collections: z.array(dataCollectionDefinitionSchema).max(20),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = new Set<string>();
    const ids = new Set<string>();
    manifest.collections.forEach((collection, index) => {
      if (keys.has(collection.key)) {
        context.addIssue({
          code: "custom",
          path: ["collections", index, "key"],
          message: `集合 key ${collection.key} 重复`,
        });
      }
      keys.add(collection.key);
      if (collection.id) {
        if (ids.has(collection.id)) {
          context.addIssue({
            code: "custom",
            path: ["collections", index, "id"],
            message: `集合 id ${collection.id} 重复`,
          });
        }
        ids.add(collection.id);
      }
    });
  });

export type DataFieldDefinition = z.infer<typeof dataFieldDefinitionSchema>;
export type DataCollectionDefinition = z.infer<
  typeof dataCollectionDefinitionSchema
>;
export type DataManifest = z.infer<typeof dataManifestSchema>;

export function parseDataManifest(value: unknown) {
  return dataManifestSchema.parse(value);
}

