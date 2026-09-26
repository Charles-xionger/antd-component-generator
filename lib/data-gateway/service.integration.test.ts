import assert from "node:assert/strict";
import test from "node:test";
import prisma from "@/lib/database/prisma";
import { DataGatewayError } from "./errors";
import {
  createOrUpdateDraftCollection,
  getDraftRecord,
  listDraftCollections,
  listDraftRecords,
} from "./service";

const integrationEnabled = process.env.DATA_GATEWAY_INTEGRATION === "1";

test(
  "isolates project ownership and DRAFT records",
  { skip: !integrationEnabled },
  async (context) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const owner = await prisma.user.create({
      data: { email: `dg-owner-${suffix}@example.test` },
    });
    const stranger = await prisma.user.create({
      data: { email: `dg-stranger-${suffix}@example.test` },
    });
    const project = await prisma.project.create({
      data: {
        name: "Data Gateway integration test",
        slug: `dg-integration-${suffix}`,
        userId: owner.id,
      },
    });

    context.after(async () => {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, stranger.id] } },
      });
      await prisma.$disconnect();
    });

    const created = await createOrUpdateDraftCollection(
      project.id,
      owner.id,
      {
        key: "customers",
        name: "客户",
        fields: [
          { key: "name", label: "姓名", type: "string", required: true },
          {
            key: "active",
            label: "启用",
            type: "boolean",
            required: false,
          },
        ],
      },
    );

    const draft = await prisma.dataRecord.create({
      data: {
        projectId: project.id,
        collectionId: created.collection.id,
        environment: "DRAFT",
        data: { name: "草稿客户", active: true },
        createdById: owner.id,
        updatedById: owner.id,
      },
    });
    await prisma.dataRecord.create({
      data: {
        projectId: project.id,
        collectionId: created.collection.id,
        environment: "PRODUCTION",
        data: { name: "生产客户", active: true },
      },
    });

    const collections = await listDraftCollections(project.id, owner.id);
    assert.equal(collections.length, 1);

    const records = await listDraftRecords(
      project.id,
      owner.id,
      "customers",
      { page: "1", pageSize: "10", filterField: "active", filterValue: "true" },
    );
    assert.equal(records.total, 1);
    assert.equal(records.records[0]?.id, draft.id);
    assert.equal(
      (records.records[0]?.data as { name?: string }).name,
      "草稿客户",
    );

    const detail = await getDraftRecord(
      project.id,
      owner.id,
      "customers",
      draft.id,
    );
    assert.equal(detail.record.id, draft.id);

    await assert.rejects(
      () => listDraftCollections(project.id, stranger.id),
      (error: unknown) =>
        error instanceof DataGatewayError && error.status === 404,
    );

    await assert.rejects(
      () =>
        listDraftRecords(project.id, owner.id, "customers", {
          filterField: "missing",
          filterValue: "value",
        }),
      (error: unknown) =>
        error instanceof DataGatewayError &&
        error.code === "UNKNOWN_FILTER_FIELD",
    );

    await assert.rejects(
      () =>
        createOrUpdateDraftCollection(project.id, owner.id, {
          key: "customers",
          name: "客户",
          fields: [],
        }),
      (error: unknown) =>
        error instanceof DataGatewayError &&
        error.code === "DANGEROUS_SCHEMA_CHANGE",
    );
  },
);
