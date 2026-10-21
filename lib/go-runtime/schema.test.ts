import test from "node:test";
import assert from "node:assert/strict";
import { projectSchemaName, validateForwardOnlyMigration } from "./schema";

test("derives schemas only from UUID project ids", () => {
  assert.equal(projectSchemaName("123e4567-e89b-12d3-a456-426614174000", "draft"), "app_123e4567e89b12d3_draft");
  assert.throws(() => projectSchemaName("../../public", "prod"));
});

test("allows additive SQL and blocks destructive SQL", () => {
  assert.match(validateForwardOnlyMigration("CREATE TABLE work_logs (id uuid PRIMARY KEY);"), /CREATE TABLE/);
  assert.throws(() => validateForwardOnlyMigration("DROP TABLE work_logs;"));
  assert.throws(() => validateForwardOnlyMigration("ALTER TABLE work_logs DROP COLUMN hours;"));
  assert.throws(() => validateForwardOnlyMigration("CREATE EXTENSION pgcrypto;"));
});
