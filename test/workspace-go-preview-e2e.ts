import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { encode } from "next-auth/jwt";

const exec = promisify(execFile);
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const runtimeNetwork = `workspace-preview-${suffix}`;
const routerNetwork = `workspace-router-${suffix}`;
const databaseContainer = `workspace-preview-db-${suffix}`;
const databaseName = "workspace_preview_e2e";
const databasePassword = `workspace_preview_${suffix}`;
const appContainers: string[] = [];
const appImages: string[] = [];

async function command(file: string, args: string[], env?: Record<string, string>) {
  return (await exec(file, args, { env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60_000 })).stdout.trim();
}

async function docker(args: string[]) { return command("docker", args); }

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No available test port"));
      server.close(() => resolve(address.port));
    });
  });
}

async function databaseReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await docker(["exec", databaseContainer, "pg_isready", "-U", "postgres", "-d", databaseName]);
      return;
    } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw new Error("Isolated PostgreSQL did not become ready");
}

async function removeNetwork(name: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await docker(["network", "rm", name]); return; }
    catch { await new Promise((resolve) => setTimeout(resolve, 300)); }
  }
  throw new Error(`Could not remove isolated test network ${name}`);
}

const backend = `package backend
import (
  "context"
  "encoding/json"
  "log/slog"
  "github.com/jackc/pgx/v5/pgxpool"
)
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation {
  return map[string]Operation{"get.item": func(_ context.Context, _ json.RawMessage) (any, error) { return map[string]any{"ok": true}, nil }}
}`;

const blueprint = {
  blueprintVersion: 1, runtimeType: "GO", product: {
    name: "Preview items", goal: "Check item preview", actors: ["Tester"], workflows: ["Get item"], acceptanceCriteria: ["Returns item"],
  },
  pages: [{ id: "items", title: "Items", route: "/", operations: ["get.item"] }],
  entities: [], operations: [{ id: "get.item", method: "GET", path: "/api/items", description: "Get item" }],
  businessRules: [], dataEvolution: [], testScenarios: [],
};

async function serveBrowserPreview(databaseUrl: string, user: { id: string; email: string | null }, projectIds: Record<"SUCCEEDED" | "FAILED", string>) {
  const nextPort = await freePort();
  const proxyPort = await freePort();
  const baseUrl = `http://127.0.0.1:${proxyPort}`;
  const authSecret = `workspace-go-browser-${suffix}`;
  const cookieName = "authjs.session-token";
  const token = await encode({ token: { id: user.id, sub: user.id, email: user.email }, secret: authSecret, salt: cookieName, maxAge: 3600 });
  let nextOutput = "";
  const next = spawn("pnpm", ["exec", "next", "start", "-p", String(nextPort)], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: authSecret, NEXTAUTH_URL: baseUrl, GITHUB_ID: "workspace-go-browser", GITHUB_SECRET: "workspace-go-browser" }, stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (chunk: Buffer) => { nextOutput = `${nextOutput}${chunk.toString()}`.slice(-8000); };
  next.stdout?.on("data", collect);
  next.stderr?.on("data", collect);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (next.exitCode !== null) throw new Error(`Next.js exited: ${nextOutput}`);
      try { if ((await fetch(`http://127.0.0.1:${nextPort}/api/auth/session`)).status < 500) { ready = true; break; } } catch { /* startup pending */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Next.js did not start: ${nextOutput}`);
    const proxy = createHttpServer((request, response) => {
      const url = new URL(request.url ?? "/", baseUrl);
      if (url.pathname === "/__test_auth") {
        const outcome = url.searchParams.get("preview") === "FAILED" ? "FAILED" : "SUCCEEDED";
        response.writeHead(302, { "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: `/projects/${projectIds[outcome]}` });
        response.end();
        return;
      }
      const upstream = httpRequest({ hostname: "127.0.0.1", port: nextPort, path: request.url, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${proxyPort}`, "x-forwarded-host": `127.0.0.1:${proxyPort}` } }, (remote) => {
        response.writeHead(remote.statusCode ?? 502, remote.headers);
        remote.pipe(response);
      });
      upstream.on("error", (error) => { if (!response.headersSent) response.writeHead(502); response.end(error.message); });
      request.pipe(upstream);
    });
    await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(proxyPort, "127.0.0.1", resolve); });
    process.stdout.write(`GO_PREVIEW_SUCCESS_URL=${baseUrl}/__test_auth?preview=SUCCEEDED\nGO_PREVIEW_FAILURE_URL=${baseUrl}/__test_auth?preview=FAILED\nType stop and press Enter to clean up the fixture.\n`);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    await new Promise<void>((resolve) => {
      const onData = (chunk: string) => {
        if (chunk.trim() !== "stop") return;
        process.stdin.off("data", onData);
        process.stdin.pause();
        resolve();
      };
      process.stdin.on("data", onData);
    });
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  } finally {
    next.kill("SIGTERM");
  }
}

async function main() {
  const port = await freePort();
  const buildRoot = await mkdtemp(path.join(tmpdir(), "workspace-preview-builds-"));
  const databaseUrl = `postgresql://postgres:${databasePassword}@127.0.0.1:${port}/${databaseName}`;
  const runtimeDatabaseUrl = `postgresql://postgres:${databasePassword}@${databaseContainer}:5432/${databaseName}`;
  let closeDatabaseConnections: typeof import("@/lib/database/prisma")["closeDatabaseConnections"] | undefined;
  try {
    await docker(["network", "create", runtimeNetwork]);
    await docker(["network", "create", routerNetwork]);
    await docker(["run", "-d", "--name", databaseContainer, "--network", runtimeNetwork, "-p", `127.0.0.1:${port}:5432`, "-e", `POSTGRES_PASSWORD=${databasePassword}`, "-e", `POSTGRES_DB=${databaseName}`, "postgres:16-alpine"]);
    await databaseReady();
    process.env.DATABASE_URL = databaseUrl;
    await command("pnpm", ["exec", "prisma", "migrate", "deploy"], { DATABASE_URL: databaseUrl });
    const [{ default: client, closeDatabaseConnections: closeConnections }, { createDraftWorkspace }, { createAgentRun }, { executeWorkspaceTask }] = await Promise.all([
      import("@/lib/database/prisma"), import("@/lib/workspace/service"), import("@/lib/workspace/agent-run"), import("@/lib/workspace/task"),
    ]);
    closeDatabaseConnections = closeConnections;
    const user = await client.user.create({ data: { email: `${randomUUID()}@workspace-preview.test` } });
    const projectIds = {} as Record<"SUCCEEDED" | "FAILED", string>;

    for (const expectedStatus of ["SUCCEEDED", "FAILED"] as const) {
      const project = await client.project.create({ data: { userId: user.id, name: `Preview ${expectedStatus}`, slug: `preview-${suffix}-${expectedStatus.toLowerCase()}`, thread: { create: { userId: user.id, title: `Preview ${expectedStatus}` } } } });
      projectIds[expectedStatus] = project.id;
      const workspace = await createDraftWorkspace({ projectId: project.id, userId: user.id, taskId: randomUUID() });
      const run = await createAgentRun({ workspaceId: workspace.id, userId: user.id, requestId: randomUUID(), goal: "Create a Go preview", runtimeType: "GO", appBlueprint: blueprint });
      const scenario = { scenarios: [{ id: "get.item", description: "Check the generated operation", steps: [{ operationId: "get.item", expectStatus: expectedStatus === "SUCCEEDED" ? 200 : 201, assertions: [{ path: "ok", operator: "equals", value: true }] }] }] };
      const files = [
        ["migrations/001_init.sql", "CREATE TABLE items (id int);"],
        ["backend/operations.go", backend],
        ["acceptance/seed.json", "{}"],
        ["acceptance/scenarios.json", JSON.stringify(scenario)],
        ["frontend/App.tsx", "export default function App() { return <main>Preview ready</main>; }"],
      ] as const;
      const decisions = [...files.map(([filePath, content]) => ({ kind: "tool", name: "write_file", arguments: { path: filePath, content } })), { kind: "complete", summary: "Go app files ready" }];
      const result = await executeWorkspaceTask({ runId: run.id, userId: user.id, model: { decide: async ({ step }: { step: number }) => decisions[step] } });
      assert.equal(result.run.status, "COMMITTED");
      assert.ok(result.commit?.previewJob);
      const agentStepsBeforePreview = await client.agentRunStep.count({ where: { runId: run.id } });
      const jobId = result.commit.previewJob.id;
      const containerName = `prompt-preview-${jobId.replaceAll("-", "").slice(0, 16)}`;
      appContainers.push(containerName);
      appImages.push(`prompt-web-generated:${jobId.toLowerCase()}`);
      await command("pnpm", ["exec", "tsx", "lib/build-jobs/worker.ts"], {
        DATABASE_URL: databaseUrl, MIGRATOR_DATABASE_URL: databaseUrl, APP_RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
        APP_RUNTIME_NETWORK: runtimeNetwork, TRAEFIK_NETWORK: routerNetwork, APP_BUILDS_ROOT: buildRoot,
        BUILD_WORKER_ONCE: "1", PUBLISHED_APPS_DOMAIN: "preview.test",
      });
      const job = await client.buildJob.findUniqueOrThrow({ where: { id: jobId } });
      assert.equal(job.status, expectedStatus, job.errorMessage ?? undefined);
      assert.equal((await client.artifactVersion.count({ where: { id: result.commit.version.id } })), 1);
      assert.equal((await client.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status, "COMMITTED");
      assert.equal((await client.agentRunStep.count({ where: { runId: run.id } })), agentStepsBeforePreview, "Preview must not call the Agent");
      assert.equal((await client.draftWorkspace.findUniqueOrThrow({ where: { id: workspace.id } })).status, "CLOSED");
      if (expectedStatus === "SUCCEEDED") {
        assert.ok(job.previewUrl?.includes("preview.test"));
        assert.match(await docker(["run", "--rm", "--network", runtimeNetwork, "curlimages/curl:8.12.1", "-fsS", `http://${containerName}:8080/healthz`]), /ok/);
        assert.match(await docker(["run", "--rm", "--network", runtimeNetwork, "curlimages/curl:8.12.1", "-fsS", "-X", "POST", "-H", "Content-Type: application/json", "--data", "{}", `http://${containerName}:8080/api/operations/get.item`]), /"ok":true/);
      } else {
        assert.match(job.errorMessage ?? "", /预期 201/);
        assert.equal((await client.draftWorkspace.findUniqueOrThrow({ where: { id: workspace.id } })).revision, files.length);
      }
      process.stdout.write(`Go Preview ${expectedStatus}: version ${result.commit.version.versionNumber}, job ${job.status}\n`);
    }
    if (process.env.WORKSPACE_GO_BROWSER === "1") await serveBrowserPreview(databaseUrl, user, projectIds);
  } finally {
    await closeDatabaseConnections?.();
    for (const containerName of appContainers) await docker(["rm", "-f", containerName]).catch(() => undefined);
    for (const imageName of appImages) await docker(["image", "rm", imageName]).catch(() => undefined);
    await docker(["rm", "-f", databaseContainer]).catch(() => undefined);
    await removeNetwork(routerNetwork);
    await removeNetwork(runtimeNetwork);
    await rm(buildRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
