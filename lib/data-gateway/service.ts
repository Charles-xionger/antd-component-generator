import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/database/prisma";
import { DataGatewayError } from "./errors";
import {
  dataCollectionDefinitionSchema,
  type DataCollectionDefinition,
  type DataFieldDefinition,
  type DataManifest,
} from "./manifest";
import { diffDataManifests } from "./schema-diff";

export const draftRecordQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    filterField: z.string().optional(),
    filterValue: z.string().max(500).optional(),
  })
  .superRefine((query, context) => {
    if (Boolean(query.filterField) !== Boolean(query.filterValue)) {
      context.addIssue({
        code: "custom",
        path: [query.filterField ? "filterValue" : "filterField"],
        message: "filterField 与 filterValue 必须同时提供",
      });
    }
  });

export type DraftRecordQuery = z.infer<typeof draftRecordQuerySchema>;

function stableId(prefix: "collection" | "field") {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function materializeCollection(
  incoming: DataCollectionDefinition,
  current?: DataCollectionDefinition,
): DataCollectionDefinition {
  const currentFields = new Map(
    (current?.fields || []).map((field) => [field.key, field]),
  );
  return dataCollectionDefinitionSchema.parse({
    ...incoming,
    id: incoming.id || current?.id || stableId("collection"),
    fields: incoming.fields.map((field) => ({
      ...field,
      id: field.id || currentFields.get(field.key)?.id || stableId("field"),
    })),
  });
}

function asManifest(collections: DataCollectionDefinition[]): DataManifest {
  return { manifestVersion: 1, collections };
}

async function assertOwnedActiveProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!project) {
    throw new DataGatewayError("Project not found", 404, "PROJECT_NOT_FOUND");
  }
  return project;
}

async function getOwnedDraftCollection(
  projectId: string,
  userId: string,
  collectionKey: string,
) {
  const collection = await prisma.dataCollection.findFirst({
    where: {
      projectId,
      key: collectionKey,
      project: { userId, status: "ACTIVE" },
    },
    include: { activeDraftSchema: true },
  });
  if (!collection?.activeDraftSchema) {
    throw new DataGatewayError(
      "Collection not found",
      404,
      "COLLECTION_NOT_FOUND",
    );
  }
  return collection;
}

export async function listDraftCollections(projectId: string, userId: string) {
  await assertOwnedActiveProject(projectId, userId);
  const collections = await prisma.dataCollection.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { activeDraftSchema: true },
  });
  return collections
    .filter((collection) => collection.activeDraftSchema)
    .map((collection) => ({
      id: collection.id,
      key: collection.key,
      name: collection.name,
      schemaVersion: collection.activeDraftSchema!.versionNumber,
      schema: collection.activeDraftSchema!.schema,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }));
}

export async function createOrUpdateDraftCollection(
  projectId: string,
  userId: string,
  value: unknown,
) {
  await assertOwnedActiveProject(projectId, userId);
  const incoming = dataCollectionDefinitionSchema.parse(value);
  const existing = await prisma.dataCollection.findUnique({
    where: { projectId_key: { projectId, key: incoming.key } },
    include: { activeDraftSchema: true },
  });

  if (!existing) {
    const definition = materializeCollection(incoming);
    return prisma.$transaction(async (tx) => {
      const collection = await tx.dataCollection.create({
        data: { projectId, key: definition.key, name: definition.name },
      });
      const schemaVersion = await tx.dataSchemaVersion.create({
        data: {
          collectionId: collection.id,
          versionNumber: 1,
          schema: definition as Prisma.InputJsonValue,
          status: "DRAFT",
        },
      });
      await tx.dataCollection.update({
        where: { id: collection.id },
        data: { activeDraftSchemaId: schemaVersion.id },
      });
      return { collection, schemaVersion, diff: null };
    });
  }

  if (!existing.activeDraftSchema) {
    throw new DataGatewayError(
      "Collection has no active draft schema",
      409,
      "DRAFT_SCHEMA_MISSING",
    );
  }
  const current = dataCollectionDefinitionSchema.parse(
    existing.activeDraftSchema.schema,
  );
  const definition = materializeCollection(incoming, current);
  const diff = diffDataManifests(asManifest([current]), asManifest([definition]));
  if (diff.dangerousChanges.length > 0) {
    throw new DataGatewayError(
      "Draft schema contains dangerous changes",
      422,
      "DANGEROUS_SCHEMA_CHANGE",
    );
  }
  if (!diff.hasChanges) {
    return {
      collection: existing,
      schemaVersion: existing.activeDraftSchema,
      diff,
    };
  }

  return prisma.$transaction(async (tx) => {
    const latest = await tx.dataSchemaVersion.aggregate({
      where: { collectionId: existing.id },
      _max: { versionNumber: true },
    });
    const schemaVersion = await tx.dataSchemaVersion.create({
      data: {
        collectionId: existing.id,
        versionNumber: (latest._max.versionNumber || 0) + 1,
        schema: definition as Prisma.InputJsonValue,
        status: "DRAFT",
      },
    });
    if (
      existing.activeDraftSchemaId !== existing.activeProductionSchemaId
    ) {
      await tx.dataSchemaVersion.update({
        where: { id: existing.activeDraftSchemaId! },
        data: { status: "SUPERSEDED" },
      });
    }
    const collection = await tx.dataCollection.update({
      where: { id: existing.id },
      data: {
        name: definition.name,
        activeDraftSchemaId: schemaVersion.id,
      },
    });
    return { collection, schemaVersion, diff };
  });
}

function parseFilterValue(field: DataFieldDefinition, rawValue: string) {
  switch (field.type) {
    case "string":
    case "enum":
      return rawValue;
    case "number": {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        throw new DataGatewayError(
          "Invalid numeric filter",
          400,
          "INVALID_FILTER",
        );
      }
      return value;
    }
    case "boolean":
      if (rawValue === "true") return true;
      if (rawValue === "false") return false;
      throw new DataGatewayError(
        "Invalid boolean filter",
        400,
        "INVALID_FILTER",
      );
    case "date":
    case "datetime":
      if (Number.isNaN(Date.parse(rawValue))) {
        throw new DataGatewayError(
          "Invalid date filter",
          400,
          "INVALID_FILTER",
        );
      }
      return rawValue;
    case "json":
      throw new DataGatewayError(
        "JSON fields cannot be filtered in DG-0.2",
        400,
        "UNSUPPORTED_FILTER",
      );
  }
}

export async function listDraftRecords(
  projectId: string,
  userId: string,
  collectionKey: string,
  queryInput: unknown,
) {
  const query = draftRecordQuerySchema.parse(queryInput);
  const collection = await getOwnedDraftCollection(
    projectId,
    userId,
    collectionKey,
  );
  const schema = dataCollectionDefinitionSchema.parse(
    collection.activeDraftSchema!.schema,
  );
  const where: Prisma.DataRecordWhereInput = {
    projectId,
    collectionId: collection.id,
    environment: "DRAFT",
    deletedAt: null,
  };

  if (query.filterField && query.filterValue) {
    const field = schema.fields.find(
      (candidate) => candidate.key === query.filterField,
    );
    if (!field) {
      throw new DataGatewayError(
        "Filter field is not in the active draft schema",
        400,
        "UNKNOWN_FILTER_FIELD",
      );
    }
    where.data = {
      path: [field.key],
      equals: parseFilterValue(field, query.filterValue),
    };
  }

  const [records, total] = await prisma.$transaction([
    prisma.dataRecord.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDirection },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        data: true,
        recordVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.dataRecord.count({ where }),
  ]);

  return {
    collection: {
      id: collection.id,
      key: collection.key,
      name: collection.name,
      schemaVersion: collection.activeDraftSchema!.versionNumber,
      schema,
    },
    records,
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getDraftRecord(
  projectId: string,
  userId: string,
  collectionKey: string,
  recordId: string,
) {
  const collection = await getOwnedDraftCollection(
    projectId,
    userId,
    collectionKey,
  );
  const record = await prisma.dataRecord.findFirst({
    where: {
      id: recordId,
      projectId,
      collectionId: collection.id,
      environment: "DRAFT",
      deletedAt: null,
    },
    select: {
      id: true,
      data: true,
      recordVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!record) {
    throw new DataGatewayError("Record not found", 404, "RECORD_NOT_FOUND");
  }
  return {
    collection: {
      id: collection.id,
      key: collection.key,
      name: collection.name,
      schemaVersion: collection.activeDraftSchema!.versionNumber,
    },
    record,
  };
}

