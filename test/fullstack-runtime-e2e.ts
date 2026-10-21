import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { assembleGoApplication } from "@/lib/go-runtime/builder";
import { runAcceptanceScenarios } from "@/lib/go-runtime/acceptance";

const exec = promisify(execFile);
const suffix = Math.random().toString(16).slice(2, 10);
const network = `prompt-e2e-${suffix}`;
const databaseContainer = `prompt-e2e-db-${suffix}`;
const appContainer = `prompt-e2e-app-${suffix}`;
const image = `prompt-web-e2e:${suffix}`;
const schema = `app_${suffix}_draft`;

async function docker(args: string[]) {
  const result = await exec("docker", args, { maxBuffer: 8 * 1024 * 1024 });
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
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await docker(["exec", databaseContainer, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "runtime_e2e"]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("PostgreSQL test container did not become ready");
}

async function invoke(operationId: string, input: Record<string, unknown>) {
  const output = await docker([
    "run", "--rm", "--network", network, "curlimages/curl:8.12.1",
    "-sS", "-X", "POST", "-H", "Content-Type: application/json", "--data", JSON.stringify(input),
    "-w", "\n%{http_code}", `http://${appContainer}:8080/api/operations/${encodeURIComponent(operationId)}`,
  ]);
  const separator = output.lastIndexOf("\n");
  assert.ok(separator >= 0, "operation response includes HTTP status");
  return { status: Number(output.slice(separator + 1)), body: JSON.parse(output.slice(0, separator)) as unknown };
}

async function main() {
  const output = await mkdtemp(path.join(tmpdir(), "prompt-runtime-e2e-"));
  const fixtureRoot = path.join(process.cwd(), "test", "fixtures", "aigc-storyboard-productivity");
  const fixturePaths = ["frontend/App.tsx", "frontend/runtime.d.ts", "backend/register.go", "migrations/0001_init.sql", "acceptance/seed.json", "acceptance/scenarios.json"];
  const port = await freePort();
  try {
    const files = await Promise.all(fixturePaths.map(async (filePath) => ({ path: filePath, content: await readFile(path.join(fixtureRoot, filePath), "utf8") })));
    await assembleGoApplication(files, output);
    await docker(["network", "create", network]);
    await docker(["run", "-d", "--name", databaseContainer, "--network", network, "-p", `127.0.0.1:${port}:5432`, "-e", "POSTGRES_PASSWORD=runtime_test", "-e", "POSTGRES_DB=runtime_e2e", "postgres:15"]);
    await waitForDatabase();

    const pool = new Pool({ connectionString: `postgresql://postgres:runtime_test@127.0.0.1:${port}/runtime_e2e` });
    const migration = await readFile(path.join(fixtureRoot, "migrations", "0001_init.sql"), "utf8");
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(migration);
    } finally {
      client.release();
      await pool.end();
    }

    await docker(["build", "--pull=false", "-t", image, output]);
    const databaseUrl = `postgresql://postgres:runtime_test@${databaseContainer}:5432/runtime_e2e?options=-csearch_path%3D${schema}`;
    await docker(["run", "-d", "--name", appContainer, "--network", network, "-e", `DATABASE_URL=${databaseUrl}`, image]);
    await docker(["run", "--rm", "--network", network, "curlimages/curl:8.12.1", "--retry", "20", "--retry-connrefused", "--retry-delay", "1", "-fsS", `http://${appContainer}:8080/healthz`]);

    const scenarios = await readFile(path.join(fixtureRoot, "acceptance", "scenarios.json"), "utf8");
    const result = await runAcceptanceScenarios(scenarios, invoke, { runId: suffix });
    assert.deepEqual(result, { scenarioCount: 1, stepCount: 10 });

    await docker(["restart", appContainer]);
    await docker(["run", "--rm", "--network", network, "curlimages/curl:8.12.1", "--retry", "20", "--retry-connrefused", "--retry-delay", "1", "-fsS", `http://${appContainer}:8080/healthz`]);
    const persisted = await invoke("dashboard.query", { projectId: `project-${suffix}` });
    assert.equal(persisted.status, 200);
    assert.equal((persisted.body as { metrics: { totalHours: number } }).metrics.totalHours, 4);
    process.stdout.write(`Full-stack runtime E2E passed: ${result.stepCount} API steps and restart persistence\n`);
  } finally {
    await docker(["rm", "-f", appContainer]).catch(() => undefined);
    await docker(["rm", "-f", databaseContainer]).catch(() => undefined);
    await docker(["network", "rm", network]).catch(() => undefined);
    await docker(["image", "rm", image]).catch(() => undefined);
    await rm(output, { recursive: true, force: true });
  }
}

void main();
