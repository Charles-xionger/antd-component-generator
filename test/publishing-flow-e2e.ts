import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import { PrismaClient } from "@/app/generated/prisma/client";

const exec = promisify(execFile);
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const runtimeNetwork = `prompt-publish-e2e-runtime-${suffix}`;
const routerNetwork = `prompt-publish-e2e-router-${suffix}`;
const databaseContainer = `prompt-publish-e2e-db-${suffix}`;
const databaseName = `publishing_e2e_${suffix}`;
const databasePassword = `publish-${suffix}`;
const authSecret = `publishing-e2e-auth-${suffix}`;
const postgresImage = process.env.PUBLISHING_E2E_POSTGRES_IMAGE || "postgres:16-alpine";
const buildsRootPromise = mkdtemp(path.join(tmpdir(), "prompt-publishing-e2e-"));
const createdContainers = new Set<string>([databaseContainer]);
const createdImages = new Set<string>();
let appServer: ChildProcess | undefined;
let appServerOutput = "";
let platformPool: Pool | undefined;
let harnessPrisma: PrismaClient | undefined;

const fixturePaths = [
  "frontend/App.tsx",
  "frontend/runtime.d.ts",
  "backend/register.go",
  "migrations/0001_init.sql",
  "acceptance/seed.json",
  "acceptance/scenarios.json",
];

const blueprint = {
  blueprintVersion: 1 as const,
  runtimeType: "GO" as const,
  product: {
    name: "AIGC 分镜产能",
    goal: "统计分镜团队产能",
    actors: ["制作负责人"],
    workflows: ["录入工时", "查看产能"],
    acceptanceCriteria: ["十步核心流程通过"],
  },
  pages: [{ id: "dashboard", title: "产能看板", route: "/", operations: ["dashboard.query"] }],
  entities: [
    { id: "people", table: "people", description: "分镜师", fields: [
      { name: "id", type: "uuid" as const, required: true },
      { name: "name", type: "string" as const, required: true },
    ] },
    { id: "projects", table: "productions", description: "制作项目", fields: [
      { name: "id", type: "uuid" as const, required: true },
      { name: "name", type: "string" as const, required: true },
    ] },
    { id: "tasks", table: "storyboard_tasks", description: "分镜任务", fields: [
      { name: "id", type: "uuid" as const, required: true },
      { name: "production_id", type: "uuid" as const, required: true },
      { name: "title", type: "string" as const, required: true },
    ] },
    { id: "workLogs", table: "work_logs", description: "工时", fields: [
      { name: "id", type: "uuid" as const, required: true },
      { name: "person_id", type: "uuid" as const, required: true },
      { name: "production_id", type: "uuid" as const, required: true },
      { name: "task_id", type: "uuid" as const, required: true },
      { name: "work_date", type: "date" as const, required: true },
      { name: "hours", type: "number" as const, required: true },
      { name: "completed_shots", type: "integer" as const, required: true },
      { name: "complexity_weight", type: "number" as const, required: true },
    ] },
  ],
  operations: ["person.create", "project.create", "task.create", "worklog.create", "dashboard.query"].map((id) => ({
    id,
    method: "POST" as const,
    path: `/api/operations/${id}`,
    description: id,
    inputSchema: {},
    outputSchema: {},
  })),
  businessRules: [],
  dataEvolution: [],
  testScenarios: [{ id: "storyboard.capacity-flow", description: "核心产能流程", expected: "10 步通过" }],
};

async function docker(args: string[]) {
  const result = await exec("docker", args, { maxBuffer: 16 * 1024 * 1024 });
  return result.stdout.trim();
}

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No test port available"));
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await docker(["exec", databaseContainer, "pg_isready", "-U", "postgres", "-d", databaseName]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("PostgreSQL E2E container did not become ready");
}

async function waitForHttp(url: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (appServer?.exitCode !== null) throw new Error(`Next.js exited before becoming ready:\n${appServerOutput.slice(-8_000)}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not become ready:\n${appServerOutput.slice(-8_000)}`);
}

async function runWorker(environment: Record<string, string>) {
  await exec("pnpm", ["exec", "tsx", "lib/build-jobs/worker.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment, BUILD_WORKER_ONCE: "1" },
    maxBuffer: 32 * 1024 * 1024,
  });
}

function normalizeFixtureSeed(raw: string) {
  const seed = JSON.parse(raw) as Record<string, Array<Record<string, unknown>>>;
  return JSON.stringify({
    people: seed.people,
    projects: seed.projects,
    tasks: seed.tasks.map(({ projectId, ...record }) => ({ ...record, production_id: projectId })),
    workLogs: seed.workLogs.map(({ personId, projectId, taskId, workDate, completedShots, complexityWeight, ...record }) => ({
      ...record,
      person_id: personId,
      production_id: projectId,
      task_id: taskId,
      work_date: workDate,
      completed_shots: completedShots,
      complexity_weight: complexityWeight,
      idempotency_key: `seed-${String(record.id)}`,
    })),
  });
}

function parseSse(raw: string) {
  return raw.split("\n\n").flatMap((block) => {
    const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
    const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    return event && data ? [{ event, data: JSON.parse(data) as unknown }] : [];
  });
}

async function main() {
  const buildsRoot = await buildsRootPromise;
  const fixtureRoot = path.join(process.cwd(), "test", "fixtures", "aigc-storyboard-productivity");
  const fixtureFiles = await Promise.all(fixturePaths.map(async (filePath) => ({
    path: filePath,
    content: await readFile(path.join(fixtureRoot, filePath), "utf8"),
  })));
  const seedFile = fixtureFiles.find((file) => file.path === "acceptance/seed.json");
  assert.ok(seedFile);
  seedFile.content = normalizeFixtureSeed(seedFile.content);

  const port = await freePort();
  const databaseUrl = `postgresql://postgres:${databasePassword}@127.0.0.1:${port}/${databaseName}`;
  const runtimeDatabaseUrl = `postgresql://postgres:${databasePassword}@${databaseContainer}:5432/${databaseName}`;
  const appPort = await freePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const commonEnvironment = {
    DATABASE_URL: databaseUrl,
    MIGRATOR_DATABASE_URL: databaseUrl,
    APP_RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
    APP_RUNTIME_NETWORK: runtimeNetwork,
    TRAEFIK_NETWORK: routerNetwork,
    APP_BUILDS_ROOT: buildsRoot,
    PUBLISHED_APPS_DOMAIN: "apps.e2e.test",
    AUTH_SECRET: authSecret,
    NEXTAUTH_URL: baseUrl,
    GITHUB_ID: "publishing-e2e",
    GITHUB_SECRET: "publishing-e2e",
  };

  await docker(["network", "create", runtimeNetwork]);
  await docker(["network", "create", routerNetwork]);
  await docker([
    "run", "-d", "--name", databaseContainer, "--network", runtimeNetwork,
    "-p", `127.0.0.1:${port}:5432`,
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-e", `POSTGRES_DB=${databaseName}`,
    postgresImage,
  ]);
  await waitForDatabase();

  await exec("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, ...commonEnvironment },
    maxBuffer: 16 * 1024 * 1024,
  });
  Object.assign(process.env, commonEnvironment);
  const { PUBLICATION_STAGES } = await import("@/lib/publishing/deployment-events");
  platformPool = new Pool({ connectionString: databaseUrl });
  harnessPrisma = new PrismaClient({ adapter: new PrismaPg(platformPool) });
  const prisma = harnessPrisma;

  const user = await prisma.user.create({ data: { name: "发布验收用户", email: `publish-${suffix}@example.test` } });
  const project = await prisma.project.create({ data: {
    userId: user.id,
    name: "AIGC 分镜产能",
    slug: `storyboard-${suffix}`,
  } });
  const artifact = await prisma.artifact.create({ data: { projectId: project.id } });
  const version1 = await prisma.artifactVersion.create({ data: {
    artifactId: artifact.id,
    versionNumber: 1,
    appBlueprint: blueprint,
    runtimeVersion: "go-1.24",
    files: { create: fixtureFiles },
  } });
  const previewJob = await prisma.buildJob.create({ data: {
    type: "FULLSTACK_PREVIEW",
    projectId: project.id,
    artifactVersionId: version1.id,
  } });

  await runWorker(commonEnvironment);
  const completedPreview = await prisma.buildJob.findUniqueOrThrow({ where: { id: previewJob.id } });
  assert.equal(completedPreview.status, "SUCCEEDED", completedPreview.errorMessage || "preview succeeds");
  assert.match(completedPreview.log || "", /10 个步骤已通过验证/);
  const previewContainer = `prompt-preview-${previewJob.id.replaceAll("-", "").slice(0, 16)}`;
  createdContainers.add(previewContainer);
  if (completedPreview.imageRef) createdImages.add(completedPreview.imageRef);

  appServer = spawn("pnpm", ["dev", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, ...commonEnvironment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collectServerOutput = (chunk: Buffer) => { appServerOutput = `${appServerOutput}${chunk.toString()}`.slice(-32_000); };
  appServer.stdout?.on("data", collectServerOutput);
  appServer.stderr?.on("data", collectServerOutput);
  await waitForHttp(`${baseUrl}/api/auth/session`);

  const cookieName = "authjs.session-token";
  const token = await encode({
    token: { id: user.id, sub: user.id, name: user.name, email: user.email },
    secret: authSecret,
    salt: cookieName,
    maxAge: 60 * 60,
  });
  const authHeaders = { Cookie: `${cookieName}=${token}` };
  const publishResponse = await fetch(`${baseUrl}/api/projects/${project.id}/deployments`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ artifactVersionId: version1.id }),
  });
  const publishResponseText = await publishResponse.text();
  assert.equal(publishResponse.status, 202, publishResponseText);
  const publishBody = JSON.parse(publishResponseText) as { deployment: { id: string }; job: { id: string } };

  await runWorker(commonEnvironment);
  const successfulJob = await prisma.buildJob.findUniqueOrThrow({ where: { id: publishBody.job.id } });
  assert.equal(successfulJob.status, "SUCCEEDED", successfulJob.errorMessage || "publish succeeds");
  const successfulDeployment = await prisma.deployment.findUniqueOrThrow({ where: { id: publishBody.deployment.id } });
  assert.equal(successfulDeployment.status, "ACTIVE");
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).activeDeploymentId, successfulDeployment.id);
  const publishContainer = `prompt-app-${successfulJob.id.replaceAll("-", "").slice(0, 16)}`;
  createdContainers.add(publishContainer);
  if (successfulJob.imageRef) createdImages.add(successfulJob.imageRef);

  const publicHealth = await docker([
    "run", "--rm", "--network", runtimeNetwork, "curlimages/curl:8.12.1",
    "-fsS", `http://${publishContainer}:8080/healthz`,
  ]);
  assert.match(publicHealth, /ok/);

  const successSseResponse = await fetch(`${baseUrl}/api/deployments/${successfulDeployment.id}/events`, { headers: authHeaders });
  assert.equal(successSseResponse.status, 200);
  const successSse = parseSse(await successSseResponse.text());
  assert.deepEqual(successSse.map((event) => event.event), ["snapshot", "complete"]);
  const successSnapshot = successSse[0].data as { state: string; terminal: boolean; activities: Array<{ stage: string }> };
  assert.equal(successSnapshot.state, "success");
  assert.equal(successSnapshot.terminal, true);
  assert.deepEqual([...new Set(successSnapshot.activities.map((event) => event.stage))], [...PUBLICATION_STAGES]);

  // Keep the sentinel below PostgreSQL's 63-byte identifier limit so the raw
  // database error proves the secret existed before the public snapshot/SSE redacted it.
  const failureSecret = "s3cr3t9";
  const version2Files = fixtureFiles.map((file) => ({ ...file }));
  version2Files.push({
    path: "migrations/0002_failure.sql",
    content: `ALTER TABLE "missing_DATABASE_URL=postgresql://e2e:${failureSecret}@database/runtime" ADD COLUMN note text;`,
  });
  const version2 = await prisma.artifactVersion.create({ data: {
    artifactId: artifact.id,
    versionNumber: 2,
    appBlueprint: blueprint,
    runtimeVersion: "go-1.24",
    files: { create: version2Files },
  } });
  const failedDeployment = await prisma.deployment.create({ data: {
    projectId: project.id,
    artifactVersionId: version2.id,
    status: "BUILDING",
    runtimeType: "GO",
  } });
  const failedJob = await prisma.buildJob.create({ data: {
    type: "PUBLISH",
    projectId: project.id,
    artifactVersionId: version2.id,
    deploymentId: failedDeployment.id,
  } });
  await runWorker(commonEnvironment);

  const failedJobResult = await prisma.buildJob.findUniqueOrThrow({ where: { id: failedJob.id } });
  assert.equal(failedJobResult.status, "FAILED");
  assert.match(failedJobResult.errorMessage || "", new RegExp(failureSecret));
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).activeDeploymentId, successfulDeployment.id);
  assert.equal((await prisma.deployment.findUniqueOrThrow({ where: { id: successfulDeployment.id } })).status, "ACTIVE");
  const failureSseResponse = await fetch(`${baseUrl}/api/deployments/${failedDeployment.id}/events`, { headers: authHeaders });
  assert.equal(failureSseResponse.status, 200);
  const failureSseText = await failureSseResponse.text();
  assert.doesNotMatch(failureSseText, new RegExp(failureSecret));
  const failureSse = parseSse(failureSseText);
  assert.deepEqual(failureSse.map((event) => event.event), ["snapshot", "error", "complete"]);
  const failureSnapshot = failureSse[0].data as {
    state: string;
    progress: { stage: string };
    previousVersionAvailable: boolean;
    error?: { technicalMessage?: string };
  };
  assert.equal(failureSnapshot.state, "failed");
  assert.equal(failureSnapshot.progress.stage, "uploading");
  assert.equal(failureSnapshot.previousVersionAvailable, true);
  assert.match(failureSnapshot.error?.technicalMessage || "", /\[REDACTED\]/);

  const releaseCenterResponse = await fetch(`${baseUrl}/api/deployments`, { headers: authHeaders });
  assert.equal(releaseCenterResponse.status, 200);
  const releaseCenterText = await releaseCenterResponse.text();
  assert.doesNotMatch(releaseCenterText, new RegExp(failureSecret));
  const releaseCenter = JSON.parse(releaseCenterText) as { projects: Array<{ activeDeploymentId: string; activeVersion: number; deployments: Array<{ status: string }> }> };
  assert.equal(releaseCenter.projects.length, 1);
  assert.equal(releaseCenter.projects[0].activeDeploymentId, successfulDeployment.id);
  assert.equal(releaseCenter.projects[0].activeVersion, 1);
  assert.deepEqual(releaseCenter.projects[0].deployments.map((deployment) => deployment.status), ["FAILED", "ACTIVE"]);

  process.stdout.write("Publishing E2E passed: preview (10 steps), authenticated HTTP publish, six-stage SSE success, isolated runtime health, safe migration failure, and release center.\n");
}

async function cleanup() {
  if (appServer && appServer.exitCode === null) {
    appServer.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => appServer?.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (appServer.exitCode === null) appServer.kill("SIGKILL");
  }
  await harnessPrisma?.$disconnect().catch(() => undefined);
  await platformPool?.end().catch(() => undefined);
  for (const container of [...createdContainers].reverse()) {
    await docker(["rm", "-f", container]).catch(() => undefined);
  }
  await docker(["network", "rm", routerNetwork]).catch(() => undefined);
  await docker(["network", "rm", runtimeNetwork]).catch(() => undefined);
  for (const image of createdImages) {
    await docker(["image", "rm", image]).catch(() => undefined);
  }
  await rm(await buildsRootPromise, { recursive: true, force: true });
}

void main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(cleanup);
