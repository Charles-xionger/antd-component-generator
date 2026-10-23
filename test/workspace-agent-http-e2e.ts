import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { encode } from "next-auth/jwt";
import prisma from "@/lib/database/prisma";
import { processPendingWorkspaceTasks } from "@/lib/workspace/worker";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must name a disposable test PostgreSQL database");

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No free port"));
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl: string, server: ChildProcess, output: () => string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early: ${output().slice(-3000)}`);
    try {
      const response = await fetch(`${baseUrl}/api/auth/session`);
      if (response.status < 500) return;
    } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not become ready: ${output().slice(-3000)}`);
}

async function main() {
  const id = randomUUID();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const authSecret = `workspace-http-e2e-${id}`;
  const deploymentsRoot = await mkdtemp(path.join(tmpdir(), "workspace-http-deployments-"));
  const server = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENTS_ROOT: deploymentsRoot, AUTH_SECRET: authSecret, NEXTAUTH_URL: baseUrl, GITHUB_ID: "workspace-http-e2e", GITHUB_SECRET: "workspace-http-e2e" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  const collect = (chunk: Buffer) => { serverOutput = `${serverOutput}${chunk.toString()}`.slice(-8000); };
  server.stdout?.on("data", collect);
  server.stderr?.on("data", collect);
  let userId: string | undefined;
  try {
    await waitForServer(baseUrl, server, () => serverOutput);
    const user = await prisma.user.create({ data: { email: `${id}@workspace-http-e2e.test`, name: "Workspace E2E" } });
    userId = user.id;
    const project = await prisma.project.create({ data: { userId: user.id, name: "Workspace HTTP E2E", slug: `workspace-http-${id}` } });
    const cookieName = "authjs.session-token";
    const token = await encode({ token: { id: user.id, sub: user.id, name: user.name, email: user.email }, secret: authSecret, salt: cookieName, maxAge: 3600 });
    const headers = { Cookie: `${cookieName}=${token}`, "Content-Type": "application/json" };
    const request = async (pathname: string, init?: RequestInit) => fetch(`${baseUrl}${pathname}`, { ...init, headers: { ...headers, ...init?.headers } });

    const firstRequestId = randomUUID();
    const createdResponse = await request("/api/workspaces", { method: "POST", body: JSON.stringify({ projectId: project.id, requestId: firstRequestId, goal: "Create a static page", runtimeType: "STATIC" }) });
    const createdText = await createdResponse.text();
    assert.equal(createdResponse.status, 202, createdText);
    const created = JSON.parse(createdText);
    assert.equal(created.run.status, "QUEUED");
    const firstDecisions = [
      { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return <p>First</p>; }" } },
      { kind: "complete", summary: "First version ready" },
    ];
    const processed = await processPendingWorkspaceTasks({ projectId: project.id, limit: 1, modelFactory: () => ({ decide: async ({ step }: { step: number }) => firstDecisions[step] }) });
    assert.equal(processed[0]?.status, "COMMITTED", JSON.stringify(processed));
    const status = await request(`/api/workspaces/${created.workspace.id}/runs/${created.run.id}`);
    assert.equal((await status.json()).run.status, "COMMITTED");
    const filesResponse = await request(`/api/workspaces/${created.workspace.id}/files`);
    const files = await filesResponse.json();
    assert.deepEqual(files.files.map((file: { path: string }) => file.path), ["frontend/App.tsx"]);
    const fileResponse = await request(`/api/workspaces/${created.workspace.id}/files?path=frontend%2FApp.tsx`);
    assert.match((await fileResponse.json()).file.content, /First/);
    const eventResponse = await request(`/api/workspaces/${created.workspace.id}/runs/${created.run.id}/events?after=0`);
    const page = await eventResponse.json();
    assert.ok(page.events.some((event: { type: string }) => event.type === "file.changed"));
    assert.ok(page.events.some((event: { type: string }) => event.type === "artifact.committed"));
    const resumed = await request(`/api/workspaces/${created.workspace.id}/runs/${created.run.id}/events?after=${page.nextCursor}`);
    assert.deepEqual((await resumed.json()).events, []);
    const latest = await request(`/api/workspaces?projectId=${project.id}`);
    assert.equal((await latest.json()).run.id, created.run.id);

    const firstVersion = await prisma.artifactVersion.findFirstOrThrow({ where: { generationRequestId: `workspace:${created.workspace.id}` } });
    const changedResponse = await request("/api/workspaces", { method: "POST", body: JSON.stringify({ projectId: project.id, requestId: randomUUID(), goal: "Change First to Second", runtimeType: "STATIC", baseArtifactVersionId: firstVersion.id }) });
    const changedText = await changedResponse.text();
    assert.equal(changedResponse.status, 202, changedText);
    const changed = JSON.parse(changedText);
    const modifyDecisions = [
      { kind: "tool", name: "search_files", arguments: { query: "First", pathGlob: "frontend/**/*.tsx", mode: "literal", contextLines: 1, maxResults: 10 } },
      { kind: "tool", name: "read_file_range", arguments: { path: "frontend/App.tsx", startLine: 1, endLine: 1 } },
      { kind: "tool", name: "patch_file", arguments: { path: "frontend/App.tsx", oldText: "First", newText: "Second" } },
      { kind: "complete", summary: "Second version ready" },
    ];
    const modified = await processPendingWorkspaceTasks({ projectId: project.id, limit: 1, modelFactory: () => ({ decide: async ({ step }: { step: number }) => modifyDecisions[step] }) });
    assert.equal(modified[0]?.status, "COMMITTED", JSON.stringify(modified));
    const versions = await prisma.artifactVersion.findMany({ where: { artifact: { projectId: project.id } }, include: { files: true }, orderBy: { versionNumber: "asc" } });
    assert.deepEqual(versions.map((version) => version.versionNumber), [1, 2]);
    assert.match(versions[1].files.find((file) => file.path === "frontend/App.tsx")!.content, /Second/);
    assert.match(versions[0].files.find((file) => file.path === "frontend/App.tsx")!.content, /First/);
    const publishResponse = await request(`/api/projects/${project.id}/deployments`, { method: "POST", body: JSON.stringify({ artifactVersionId: versions[1].id }) });
    const publishBody = await publishResponse.text();
    assert.equal(publishResponse.status, 201, publishBody);
    assert.equal(JSON.parse(publishBody).deployment.status, "ACTIVE");
    const publicResponse = await fetch(`${baseUrl}/published/${project.slug}`);
    assert.equal(publicResponse.status, 200);
    const publicHtml = await publicResponse.text();
    const scriptPath = publicHtml.match(/<script type="module" src="\/([^\"]+)"/i)?.[1];
    assert.ok(scriptPath, "Published page must reference its built JavaScript");
    const scriptResponse = await fetch(`${baseUrl}/published/${project.slug}/${scriptPath}`);
    assert.equal(scriptResponse.status, 200);
    assert.match(await scriptResponse.text(), /Second/);
    assert.equal((await request(`/api/workspaces/${changed.workspace.id}/files?path=..%2Fsecret`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/workspaces/${changed.workspace.id}/files`)).status, 401);
    process.stdout.write("Workspace HTTP E2E passed: create, worker commit, cursor replay, restore, modify, static publish, public files, ownership\n");
  } finally {
    server.kill("SIGTERM");
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    await rm(deploymentsRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
