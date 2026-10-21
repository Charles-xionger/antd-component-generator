import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import prisma from "@/lib/database/prisma";
import { assembleGoApplication } from "@/lib/go-runtime/builder";
import { runAcceptanceScenarios } from "@/lib/go-runtime/acceptance";
import { projectSchemaName, quoteIdentifier, validateForwardOnlyMigration } from "@/lib/go-runtime/schema";
import { appendBuildActivity } from "./service";
import {
  appendPublicationActivity,
  limitPublicationLog,
  publicationActivityForStatus,
} from "@/lib/publishing/deployment-events";
import { appBlueprintSchema } from "@/lib/app-contracts";
import { validateFullstackArtifact } from "@/lib/go-runtime/artifact-validator";

const run = promisify(execFile);
const workerId = randomUUID();
const buildsRoot = path.resolve(process.env.APP_BUILDS_ROOT || "/app-builds");
const appsDomain = process.env.PUBLISHED_APPS_DOMAIN || "apps.localhost";
const dockerNetwork = process.env.APP_RUNTIME_NETWORK || "prompt_web_internal";
const traefikNetwork = process.env.TRAEFIK_NETWORK || "traefik_net";

async function claimJob() {
  const candidate = await prisma.buildJob.findFirst({
    where: {
      OR: [
        { status: "QUEUED" },
        { status: { in: ["BUILDING", "MIGRATING", "TESTING", "STARTING", "VERIFYING"] }, leaseExpiresAt: { lt: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const leaseToken = `${workerId}:${randomUUID()}`;
  const claimed = await prisma.buildJob.updateMany({
    where: { id: candidate.id, OR: [{ status: "QUEUED" }, { leaseExpiresAt: { lt: new Date() } }] },
    data: { status: "BUILDING", leaseToken, leaseExpiresAt: new Date(Date.now() + 10 * 60_000), startedAt: candidate.startedAt || new Date(), attempt: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  await appendBuildActivity(candidate.id, publicationActivityForStatus("QUEUED"));
  return prisma.buildJob.findUnique({ where: { id: candidate.id } });
}

async function setStatus(jobId: string, status: "BUILDING" | "MIGRATING" | "TESTING" | "STARTING" | "VERIFYING") {
  await prisma.buildJob.update({ where: { id: jobId }, data: { status, leaseExpiresAt: new Date(Date.now() + 10 * 60_000) } });
  await appendBuildActivity(jobId, publicationActivityForStatus(status));
}

async function applyMigrations(projectId: string, environment: "draft" | "prod", directory: string) {
  const databaseUrl = process.env.MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATOR_DATABASE_URL or DATABASE_URL is required");
  const schema = projectSchemaName(projectId, environment);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const entries = (await import("node:fs/promises")).readdir(directory);
    const files = (await entries).filter((name) => name.endsWith(".sql")).sort();
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema)}._prompt_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const file of files) {
      const exists = await client.query(`SELECT 1 FROM ${quoteIdentifier(schema)}._prompt_migrations WHERE version = $1`, [file]);
      if (exists.rowCount) continue;
      const sql = validateForwardOnlyMigration(await readFile(path.join(directory, file), "utf8"));
      await client.query(sql);
      await client.query(`INSERT INTO ${quoteIdentifier(schema)}._prompt_migrations(version) VALUES ($1)`, [file]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function provisionRuntimeDatabase(projectId: string, environment: "draft" | "prod") {
  const raw = process.env.MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("MIGRATOR_DATABASE_URL or DATABASE_URL is required");
  const runtimeRaw = process.env.APP_RUNTIME_DATABASE_URL || raw;
  const schema = projectSchemaName(projectId, environment);
  const role = `${schema}_rw`;
  const password = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString: raw, max: 1 });
  const client = await pool.connect();
  try {
    const roleExists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    const escapedPassword = password.replaceAll("'", "''");
    if (roleExists.rowCount) await client.query(`ALTER ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD '${escapedPassword}'`);
    else await client.query(`CREATE ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD '${escapedPassword}'`);
    await client.query(`GRANT USAGE ON SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(role)}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(role)}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(role)}`);
    await client.query(`ALTER ROLE ${quoteIdentifier(role)} SET search_path TO ${quoteIdentifier(schema)}`);
  } finally {
    client.release();
    await pool.end();
  }
  const url = new URL(runtimeRaw);
  url.username = role;
  url.password = password;
  url.searchParams.set("options", `-csearch_path=${schema}`);
  return url.toString();
}

function stableSeedUuid(projectId: string, alias: string) {
  const bytes = createHash("sha256").update(`${projectId}:${alias}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function replaceSeedAliases(value: unknown, aliases: Map<string, string>): unknown {
  if (typeof value === "string") return aliases.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => replaceSeedAliases(entry, aliases));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceSeedAliases(entry, aliases)]));
  }
  return value;
}

async function seedDraftData(projectId: string, blueprintValue: unknown, rawSeed: string) {
  const blueprint = appBlueprintSchema.parse(blueprintValue);
  const parsed = JSON.parse(rawSeed) as Record<string, Array<Record<string, unknown>>>;
  const entities = new Map(blueprint.entities.map((entity) => [entity.id, entity]));
  const aliases = new Map<string, string>();

  for (const [entityId, records] of Object.entries(parsed)) {
    const entity = entities.get(entityId);
    if (!entity) throw new Error(`验收种子数据引用了未知实体 ${entityId}`);
    const idField = entity.fields.find((field) => field.name === "id");
    if (idField?.type !== "uuid") continue;
    for (const record of records) {
      if (typeof record.id === "string") aliases.set(record.id, stableSeedUuid(projectId, record.id));
    }
  }

  const databaseUrl = process.env.MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATOR_DATABASE_URL or DATABASE_URL is required");
  const schema = projectSchemaName(projectId, "draft");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
    for (const [entityId, records] of Object.entries(parsed)) {
      const entity = entities.get(entityId)!;
      const fieldTypes = new Map(entity.fields.map((field) => [field.name, field.type]));
      for (const sourceRecord of records) {
        const record = replaceSeedAliases(sourceRecord, aliases) as Record<string, unknown>;
        const columns = Object.keys(record);
        if (!columns.length || columns.some((column) => !/^[a-z][a-z0-9_]{0,62}$/.test(column))) {
          throw new Error(`验收种子数据 ${entityId} 包含无效字段`);
        }
        const values = columns.map((column) => fieldTypes.get(column) === "json" ? JSON.stringify(record[column]) : record[column]);
        const assignments = columns.filter((column) => column !== "id").map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);
        const conflict = columns.includes("id")
          ? assignments.length ? ` ON CONFLICT (id) DO UPDATE SET ${assignments.join(", ")}` : " ON CONFLICT (id) DO NOTHING"
          : "";
        await client.query(
          `INSERT INTO ${quoteIdentifier(entity.table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})${conflict}`,
          values,
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  return aliases;
}

function remapAcceptanceAliases(value: unknown, aliases: Map<string, string>, runId: string): unknown {
  if (typeof value === "string") {
    if (aliases.has(value)) return aliases.get(value)!;
    const prefix = `${runId}_`;
    if (value.startsWith(prefix) && aliases.has(value.slice(prefix.length))) return aliases.get(value.slice(prefix.length))!;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => remapAcceptanceAliases(entry, aliases, runId));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remapAcceptanceAliases(entry, aliases, runId)]));
  }
  return value;
}

async function docker(args: string[]) {
  try {
    const result = await run("docker", args, { maxBuffer: 8 * 1024 * 1024 });
    return result.stdout.trim();
  } catch (error) {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
    // execFile's default message only reports that `docker build` failed and
    // previously discarded the compiler output users actually need. Do not
    // include the command arguments here: `docker run` may contain DB secrets.
    const output = [record.stderr, record.stdout]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
      .join("\n")
      .slice(-24_000);
    throw new Error(`Docker ${args[0] || "command"} failed${output ? `:\n${output}` : ""}`);
  }
}

async function invokeContainerOperation(containerName: string, operationId: string, input: Record<string, unknown>) {
  const output = await docker([
    "run", "--rm", "--network", dockerNetwork, "curlimages/curl:8.12.1",
    "-sS", "-X", "POST", "-H", "Content-Type: application/json",
    "--data", JSON.stringify(input), "-w", "\n%{http_code}",
    `http://${containerName}:8080/api/operations/${encodeURIComponent(operationId)}`,
  ]);
  const separator = output.lastIndexOf("\n");
  if (separator < 0) throw new Error(`验收接口 ${operationId} 未返回 HTTP 状态`);
  const bodyText = output.slice(0, separator);
  const status = Number(output.slice(separator + 1));
  let body: unknown = bodyText;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* assertions can still inspect the raw body */ }
  return { status, body };
}

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>) {
  const version = await prisma.artifactVersion.findUnique({ where: { id: job.artifactVersionId }, include: { files: true, artifact: { include: { project: true } } } });
  if (!version || version.artifact.projectId !== job.projectId) throw new Error("Artifact version is unavailable");
  if (job.type === "UNPUBLISH") {
    if (!job.deploymentId) throw new Error("Unpublish job has no deployment");
    const containerName = `prompt-app-${job.deploymentId.replaceAll("-", "").slice(0, 16)}`;
    await docker(["rm", "-f", containerName]).catch(() => undefined);
    await prisma.$transaction([
      prisma.deployment.update({ where: { id: job.deploymentId }, data: { status: "DISABLED" } }),
      prisma.project.update({ where: { id: job.projectId }, data: { activeDeploymentId: null } }),
      prisma.buildJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), leaseToken: null, leaseExpiresAt: null } }),
    ]);
    return;
  }
  if (version.runtimeVersion !== "go-1.24" || !version.appBlueprint) throw new Error("Artifact is not a validated Go application");
  const blueprint = appBlueprintSchema.parse(version.appBlueprint);
  const contractErrors = validateFullstackArtifact(version.files, blueprint);
  if (contractErrors.length) throw new Error(`生成产物未通过契约检查：\n${contractErrors.join("\n")}`);

  const buildDir = path.join(buildsRoot, job.id);
  await mkdir(buildsRoot, { recursive: true });
  await setStatus(job.id, "BUILDING");
  await assembleGoApplication(version.files, buildDir);

  // Compile the complete frontend + Go image before touching a project schema.
  // A syntax or type error must never leave database changes behind.
  await setStatus(job.id, "TESTING");
  const imageRef = `prompt-web-generated:${job.id.toLowerCase()}`;
  await docker(["build", "--pull=false", "-t", imageRef, buildDir]);

  const environment = job.type === "PUBLISH" ? "prod" : "draft";
  await setStatus(job.id, "MIGRATING");
  await applyMigrations(job.projectId, environment, path.join(buildDir, "migrations"));
  let seedAliases = new Map<string, string>();
  if (job.type === "FULLSTACK_PREVIEW") {
    const seedFile = version.files.find((file) => file.path === "acceptance/seed.json");
    if (!seedFile) throw new Error("Full-stack artifact is missing acceptance/seed.json");
    seedAliases = await seedDraftData(job.projectId, blueprint, seedFile.content);
  }
  const runtimeDatabaseUrl = await provisionRuntimeDatabase(job.projectId, environment);

  await setStatus(job.id, "STARTING");
  const prefix = job.type === "PUBLISH" ? "prompt-app" : "prompt-preview";
  const containerName = `${prefix}-${job.id.replaceAll("-", "").slice(0, 16)}`;
  const hostname = job.type === "PUBLISH"
    ? `${version.artifact.project.slug}.${appsDomain}`
    : `preview-${job.id.replaceAll("-", "").slice(0, 12)}.${appsDomain}`;
  await docker(["rm", "-f", containerName]).catch(() => undefined);
  await docker([
    "run", "-d", "--name", containerName, "--restart", "unless-stopped",
    "--network", dockerNetwork,
    "-e", `DATABASE_URL=${runtimeDatabaseUrl}`,
    "-l", "traefik.enable=true",
    "-l", `traefik.docker.network=${traefikNetwork}`,
    "-l", `traefik.http.routers.${containerName}.rule=Host(\`${hostname}\`)`,
    "-l", `traefik.http.routers.${containerName}.entrypoints=websecure`,
    "-l", `traefik.http.routers.${containerName}.tls=true`,
    "-l", `traefik.http.routers.${containerName}.priority=200`,
    "-l", `traefik.http.services.${containerName}.loadbalancer.server.port=8080`,
    imageRef,
  ]);
  await docker(["network", "connect", traefikNetwork, containerName]);

  await setStatus(job.id, "VERIFYING");
  // The distroless app exposes HTTP only; check through the shared Docker network.
  const probe = await docker(["run", "--rm", "--network", dockerNetwork, "curlimages/curl:8.12.1", "-fsS", `http://${containerName}:8080/healthz`]);
  if (!probe.includes("ok")) throw new Error("Go application health check returned an invalid response");
  if (job.type === "FULLSTACK_PREVIEW") {
    const acceptanceFile = version.files.find((file) => file.path === "acceptance/scenarios.json");
    if (!acceptanceFile) throw new Error("Full-stack artifact is missing acceptance/scenarios.json");
    const runId = job.id.replaceAll("-", "");
    const acceptance = await runAcceptanceScenarios(
      acceptanceFile.content,
      (operationId, input) => invokeContainerOperation(
        containerName,
        operationId,
        remapAcceptanceAliases(input, seedAliases, runId) as Record<string, unknown>,
      ),
      { runId },
    );
    await appendBuildActivity(job.id, {
      stage: "verifying",
      level: "success",
      message: `${acceptance.scenarioCount} 个场景、${acceptance.stepCount} 个步骤已通过验证`,
    });
  }

  const endpoint = `https://${hostname}`;
  const previousActive = job.type === "PUBLISH"
    ? await prisma.project.findUnique({ where: { id: job.projectId }, select: { activeDeploymentId: true } })
    : null;
  const currentLog = await prisma.buildJob.findUnique({
    where: { id: job.id },
    select: { log: true },
  });
  const succeeded = appendPublicationActivity(currentLog?.log, {
    ...publicationActivityForStatus("SUCCEEDED"),
    timestamp: new Date().toISOString(),
  });
  const completedAt = new Date();
  await prisma.$transaction(async (tx) => {
    if (job.type === "PUBLISH") {
      if (!job.deploymentId) throw new Error("Publish job has no deployment");
      const current = await tx.project.findUnique({ where: { id: job.projectId }, select: { activeDeploymentId: true } });
      if (current?.activeDeploymentId) await tx.deployment.update({ where: { id: current.activeDeploymentId }, data: { status: "SUPERSEDED" } });
      await tx.deployment.update({ where: { id: job.deploymentId }, data: { status: "ACTIVE", runtimeType: "GO", imageRef, endpoint, activatedAt: new Date(), verification: { buildJobId: job.id } } });
      await tx.project.update({ where: { id: job.projectId }, data: { activeDeploymentId: job.deploymentId } });
    }
    await tx.buildJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        imageRef,
        previewUrl: endpoint,
        log: limitPublicationLog(succeeded.log),
        completedAt,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  });
  if (previousActive?.activeDeploymentId && previousActive.activeDeploymentId !== job.deploymentId) {
    const oldContainer = `prompt-app-${previousActive.activeDeploymentId.replaceAll("-", "").slice(0, 16)}`;
    await docker(["rm", "-f", oldContainer]).catch(() => undefined);
  }
  await rm(buildDir, { recursive: true, force: true }).catch(() => undefined);
}

async function cleanupFailedJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>) {
  if (job.type !== "UNPUBLISH") {
    const prefix = job.type === "PUBLISH" ? "prompt-app" : "prompt-preview";
    const containerName = `${prefix}-${job.id.replaceAll("-", "").slice(0, 16)}`;
    await docker(["rm", "-f", containerName]).catch(() => undefined);
    await docker(["image", "rm", `prompt-web-generated:${job.id.toLowerCase()}`]).catch(() => undefined);
  }
  await rm(path.join(buildsRoot, job.id), { recursive: true, force: true }).catch(() => undefined);
}

async function tick() {
  const job = await claimJob();
  if (!job) return false;
  try {
    await processJob(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await cleanupFailedJob(job);
    const latest = await prisma.buildJob.findUnique({
      where: { id: job.id },
      select: { status: true, log: true },
    });
    const failed = appendPublicationActivity(latest?.log, {
      ...publicationActivityForStatus("FAILED", message, latest?.status),
      timestamp: new Date().toISOString(),
    });
    await prisma.buildJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        log: limitPublicationLog(failed.log),
        errorMessage: message,
        completedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (job.deploymentId) await prisma.deployment.update({ where: { id: job.deploymentId }, data: { status: "FAILED", errorMessage: message } });
  }
  return true;
}

async function main() {
  if (process.env.BUILD_WORKER_ONCE === "1") {
    await tick();
    await prisma.$disconnect();
    return;
  }
  for (;;) {
    const worked = await tick();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

void main();
