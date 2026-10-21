import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { encode } from "next-auth/jwt";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import prisma from "@/lib/database/prisma";
import { createGraph } from "@/lib/agent";
import { createAgentRun } from "@/lib/workspace/agent-run";
import { createDraftWorkspace, writeDraftFile } from "@/lib/workspace/service";
import { executeWorkspaceTask } from "@/lib/workspace/task";
import { processPendingWorkspaceTasks } from "@/lib/workspace/worker";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point to an isolated test PostgreSQL database");

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No port"));
      server.close(() => resolve(address.port));
    });
  });
}

const requirement = {
  name: "文本整理工具", goal: "将输入文本整理为统一格式", actors: ["业务用户"], workflows: ["输入文本并整理"],
  entities: [], businessRules: [], outOfScope: ["账号与多人协作"], acceptanceCriteria: ["输入文本后可查看整理结果"], confirmed: true,
};
const blueprint = {
  blueprintVersion: 1, runtimeType: "STATIC", product: { name: requirement.name, goal: requirement.goal, actors: requirement.actors, workflows: requirement.workflows, acceptanceCriteria: requirement.acceptanceCriteria },
  pages: [{ id: "formatter", title: "文本整理", route: "/", operations: [] }], entities: [], operations: [], businessRules: [], dataEvolution: [], testScenarios: [],
};
const appFile = `import { useState } from "react";
export default function App() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  return <main style={{ maxWidth: 680, margin: "3rem auto", padding: 24 }}>
    <h1>文本整理</h1>
    <textarea aria-label="输入文本" value={input} onChange={(event) => setInput(event.target.value)} />
    <button style={{ backgroundColor: "#444", color: "white" }} onClick={() => setOutput(input.trim().replace(/\\s+/g, " "))}>整理文本</button>
    <p aria-label="整理结果">{output}</p>
  </main>;
}
`;
const brokenAppFile = "export default function App() { return <div>Broken";
const goBackend = `package backend
import (
  "context"
  "encoding/json"
  "log/slog"
  "github.com/jackc/pgx/v5/pgxpool"
)
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation {
  return map[string]Operation{"get.item": func(_ context.Context, _ json.RawMessage) (any, error) { return map[string]any{"ok": true}, nil }}
}`;
const goBlueprint = {
  blueprintVersion: 1, runtimeType: "GO",
  product: { name: "Go 条目", goal: "读取条目", actors: ["用户"], workflows: ["读取条目"], acceptanceCriteria: ["接口返回条目"] },
  pages: [{ id: "items", title: "条目", route: "/", operations: ["get.item"] }],
  entities: [], operations: [{ id: "get.item", method: "GET", path: "/api/items", description: "读取条目" }],
  businessRules: [], dataEvolution: [], testScenarios: [],
};

async function seedGoProject(projectId: string, userId: string) {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a Go item app", runtimeType: "GO", appBlueprint: goBlueprint });
  const files = [
    ["migrations/001_init.sql", "CREATE TABLE items (id int);"],
    ["backend/operations.go", goBackend],
    ["acceptance/seed.json", "{}"],
    ["acceptance/scenarios.json", JSON.stringify({ scenarios: [{ id: "get.item", description: "Read item", steps: [{ operationId: "get.item", expectStatus: 200 }] }] })],
    ["frontend/App.tsx", "export default function App() { return <main>Go v1 ready</main>; }"],
  ] as const;
  const decisions = [...files.map(([path, content]) => ({ kind: "tool", name: "write_file", arguments: { path, content } })), { kind: "complete", summary: "Go v1 ready" }];
  const result = await executeWorkspaceTask({ runId: run.id, userId, model: { decide: async ({ step }: { step: number }) => decisions[step] } });
  if (result.run.status !== "COMMITTED" || result.commit?.version.versionNumber !== 1) throw new Error("Could not seed Go browser project");
}

async function seedInterruptedRun(projectId: string, userId: string) {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "恢复测试：生成双文件页面", runtimeType: "STATIC" });
  const leaseToken = randomUUID();
  await prisma.agentRun.update({ where: { id: run.id }, data: { status: "RUNNING", leaseToken, leaseUntil: new Date(Date.now() + 120_000), plan: { summary: "写入页面和样式后验证", steps: [{ id: "write", title: "写入两个文件", status: "completed" }, { id: "validate", title: "验证并提交", status: "in_progress" }] } } });
  const files = [
    ["frontend/App.tsx", "import './styles.css'; export default function App() { return <main>恢复后的页面</main>; }"],
    ["frontend/styles.css", "main { color: #2563eb; }"],
  ] as const;
  for (const [index, [path, content]] of files.entries()) {
    await writeDraftFile({ workspaceId: workspace.id, userId, toolCallId: `${run.id}:${index}`, expectedRevision: index, path, content, agentLease: { runId: run.id, leaseToken } });
    await prisma.agentRunStep.create({ data: { runId: run.id, number: index, status: "COMPLETED", decision: { decision: { kind: "tool", name: "write_file", arguments: { path, content } }, expectedRevision: index }, result: { ok: true }, completedAt: new Date() } });
  }
  await prisma.agentRunStep.create({ data: { runId: run.id, number: 2, decision: { decision: { kind: "complete", summary: "双文件页面已恢复" }, expectedRevision: 2 } } });
  await prisma.agentRun.update({ where: { id: run.id }, data: { nextStep: 2, leaseUntil: new Date(Date.now() - 1000) } });
  return { workspaceId: workspace.id, runId: run.id };
}

function scriptedResponse(requestBody: Record<string, unknown>) {
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages as Array<{ role?: string; content?: unknown }> : [];
  const system = messages.filter((message) => message.role === "system").map((message) => String(message.content ?? "")).join("\n");
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  let content: string | undefined;
  let tool: { name: string; arguments: Record<string, unknown> } | undefined;
  if (Array.isArray(requestBody.tools)) {
    const observation = JSON.parse(String(latestUser?.content ?? "{}")) as { goal?: string; step?: number };
    const modification = /按钮|blue|颜色/i.test(observation.goal ?? "");
    const questionFlow = /需要确认/.test(observation.goal ?? "");
    if (/Go修改测试/.test(observation.goal ?? "")) {
      tool = observation.step === 0 ? { name: "read_file", arguments: { path: "backend/operations.go" } }
        : observation.step === 1 ? { name: "patch_file", arguments: { path: "backend/operations.go", oldText: '"ok": true', newText: '"ok": true, "label": "updated"' } }
          : observation.step === 2 ? { name: "read_file", arguments: { path: "frontend/App.tsx" } }
            : observation.step === 3 ? { name: "patch_file", arguments: { path: "frontend/App.tsx", oldText: "Go v1 ready", newText: "Go v2 updated" } }
              : { name: "complete", arguments: { summary: "Go 页面与接口已定向修改" } };
    } else if (/诊断测试/.test(observation.goal ?? "")) {
      tool = observation.step === 0 ? { name: "update_plan", arguments: { summary: "编写页面并修复编译错误", steps: [{ id: "frontend", title: "编写页面", status: "in_progress" }, { id: "repair", title: "修复诊断并提交", status: "pending" }] } }
        : observation.step === 1 ? { name: "write_file", arguments: { path: "frontend/App.tsx", content: brokenAppFile } }
          : observation.step === 2 ? { name: "complete", arguments: { summary: "检查页面" } }
            : observation.step === 3 ? { name: "read_file", arguments: { path: "frontend/App.tsx" } }
              : observation.step === 4 ? { name: "patch_file", arguments: { path: "frontend/App.tsx", oldText: brokenAppFile, newText: appFile } }
                : { name: "complete", arguments: { summary: "编译错误已定向修复" } };
    } else if (/取消测试/.test(observation.goal ?? "")) {
      tool = observation.step === 0
        ? { name: "write_file", arguments: { path: "frontend/App.tsx", content: appFile } }
        : { name: "complete", arguments: { summary: "取消测试任务" } };
    } else if (questionFlow) {
      tool = !/用户补充：/.test(observation.goal ?? "")
        ? { name: "ask_question", arguments: { question: "整理按钮应该使用什么颜色？" } }
        : observation.step === 0
          ? { name: "write_file", arguments: { path: "frontend/App.tsx", content: appFile.replace('backgroundColor: "#444"', 'backgroundColor: "#2563eb"') } }
          : { name: "complete", arguments: { summary: "已按确认的颜色生成页面" } };
    } else if (modification) {
      tool = observation.step === 0 ? { name: "read_file", arguments: { path: "frontend/App.tsx" } }
        : observation.step === 1 ? { name: "patch_file", arguments: { path: "frontend/App.tsx", oldText: 'backgroundColor: "#444"', newText: 'backgroundColor: "#2563eb"' } }
          : { name: "complete", arguments: { summary: "按钮颜色已更新" } };
    } else {
      tool = observation.step === 0 ? { name: "update_plan", arguments: { summary: "建立文本整理页面并验证", steps: [{ id: "frontend", title: "编写文本整理页面", status: "in_progress" }, { id: "validation", title: "检查并提交", status: "pending" }] } }
        : observation.step === 1 ? { name: "write_file", arguments: { path: "frontend/App.tsx", content: appFile } }
          : { name: "complete", arguments: { summary: "文本整理页面已完成" } };
    }
  } else if (system.includes("业务分析师")) content = `<requirementSpec>${JSON.stringify(requirement)}</requirementSpec>`;
  else if (system.includes("解决方案架构师")) content = `<appBlueprint>${JSON.stringify(blueprint)}</appBlueprint>`;
  else if (system.includes("意图路由器")) content = `<intentResult>${JSON.stringify({ intent: "MODIFY_APP", confidence: 1, requiresClarification: false, reason: "修改现有页面", requestedCapabilities: [] })}</intentResult>`;
  else content = "文本整理工具";
  return { content, tool };
}

function fakeModelServer() {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    if (Array.isArray(body.tools)) {
      const messages = Array.isArray(body.messages) ? body.messages as Array<{ role?: string; content?: unknown }> : [];
      const latestUser = [...messages].reverse().find((message) => message.role === "user");
      const observation = JSON.parse(String(latestUser?.content ?? "{}")) as { goal?: string; step?: number };
      if ((/取消测试/.test(observation.goal ?? "") && observation.step === 0) || (/诊断测试/.test(observation.goal ?? "") && observation.step === 3)) await new Promise((resolve) => setTimeout(resolve, 8000));
    }
    const result = scriptedResponse(body);
    const toolCalls = result.tool ? [{ index: 0, id: `call-${randomUUID()}`, type: "function", function: { name: result.tool.name, arguments: JSON.stringify(result.tool.arguments) } }] : undefined;
    const model = String(body.model ?? "test-model");
    if (body.stream !== true) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: `chatcmpl-${randomUUID()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: "assistant", content: result.content ?? null, tool_calls: toolCalls }, finish_reason: toolCalls ? "tool_calls" : "stop" }] }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const base = { id: `chatcmpl-${randomUUID()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", ...(toolCalls ? { tool_calls: toolCalls } : { content: result.content }) }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: toolCalls ? "tool_calls" : "stop" }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
}

async function listen(server: Server, port: number) {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
}

async function waitForNext(port: number, child: ChildProcess, output: () => string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next.js exited: ${output().slice(-4000)}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/auth/session`)).status < 500) return; } catch { /* start pending */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not start: ${output().slice(-4000)}`);
}

async function main() {
  const id = randomUUID();
  const [modelPort, nextPort, freeProxyPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const requestedProxyPort = Number(process.env.WORKSPACE_BROWSER_PROXY_PORT);
  const proxyPort = Number.isInteger(requestedProxyPort) && requestedProxyPort > 1024 && requestedProxyPort < 65536 ? requestedProxyPort : freeProxyPort;
  const baseUrl = `http://127.0.0.1:${proxyPort}`;
  const authSecret = `workspace-browser-fixture-${id}`;
  const modelServer = fakeModelServer();
  await listen(modelServer, modelPort);
  process.env.ALIYUN_BASE_URL = `http://127.0.0.1:${modelPort}/v1`;
  process.env.ALIYUN_API_KEY = "workspace-browser-fixture";
  const user = await prisma.user.create({ data: { email: `${id}@workspace-browser.test`, name: "工作区验收用户" } });
  const project = await prisma.project.create({ data: { userId: user.id, name: "新项目", slug: `workspace-browser-${id}`, thread: { create: { userId: user.id, title: "新项目" } } } });
  const interrupted = process.env.WORKSPACE_BROWSER_RECOVERY_SEED === "1" ? await seedInterruptedRun(project.id, user.id) : null;
  const secondaryProject = await prisma.project.create({ data: { userId: user.id, name: "并行项目", slug: `workspace-parallel-${id}`, thread: { create: { userId: user.id, title: "并行项目" } } } });
  const legacyProject = process.env.WORKSPACE_BROWSER_LEGACY_SEED === "1"
    ? await prisma.project.create({ data: { userId: user.id, name: "旧版项目", slug: `workspace-legacy-${id}`, thread: { create: { userId: user.id, title: "旧版项目" } } } })
    : null;
  const legacyThread = legacyProject ? await prisma.thread.findUniqueOrThrow({ where: { projectId: legacyProject.id } }) : null;
  if (legacyThread) {
    const graph = await createGraph();
    await graph.updateState({ configurable: { thread_id: legacyThread.id } }, { messages: [
      new HumanMessage("创建旧版欢迎页"),
      new AIMessage('旧版页面已生成。\n<boltArtifact id="legacy-page" title="旧版欢迎页"><boltAction type="file" filePath="frontend/App.tsx">export default function App() { return <h1>旧版欢迎页</h1>; }</boltAction></boltArtifact>'),
    ] });
  }
  const goProject = process.env.WORKSPACE_BROWSER_GO_SEED === "1"
    ? await prisma.project.create({ data: { userId: user.id, name: "Go 修改项目", slug: `workspace-go-${id}`, thread: { create: { userId: user.id, title: "Go 修改项目" } } } })
    : null;
  if (goProject) await seedGoProject(goProject.id, user.id);
  const otherUser = await prisma.user.create({ data: { email: `${id}@workspace-browser-private.test`, name: "其他用户" } });
  const privateProject = await prisma.project.create({ data: { userId: otherUser.id, name: "无权项目", slug: `workspace-private-${id}`, thread: { create: { userId: otherUser.id, title: "无权项目" } } } });
  const cookieName = "authjs.session-token";
  const token = await encode({ token: { id: user.id, sub: user.id, name: user.name, email: user.email }, secret: authSecret, salt: cookieName, maxAge: 3600 });
  let nextOutput = "";
  const next = spawn("pnpm", ["exec", "next", "start", "-p", String(nextPort)], {
    cwd: process.cwd(),
    env: { ...process.env, AUTH_SECRET: authSecret, NEXTAUTH_URL: baseUrl, GITHUB_ID: "workspace-browser-fixture", GITHUB_SECRET: "workspace-browser-fixture" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (chunk: Buffer) => { nextOutput = `${nextOutput}${chunk.toString()}`.slice(-8000); };
  next.stdout?.on("data", collect);
  next.stderr?.on("data", collect);
  await waitForNext(nextPort, next, () => nextOutput);
  let workerPaused = process.env.WORKSPACE_BROWSER_START_PAUSED === "1";
  const proxy = createServer((request, response) => {
    if (request.url === "/__test_resume_worker" && request.method === "POST") {
      workerPaused = false;
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/__test_auth") {
      response.writeHead(302, { "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: `/projects/${project.id}` });
      response.end();
      return;
    }
    if (request.url === "/__test_auth_secondary") {
      response.writeHead(302, { "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: `/projects/${secondaryProject.id}` });
      response.end();
      return;
    }
    if (request.url === "/__test_auth_legacy" && legacyProject) {
      response.writeHead(302, { "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: `/projects/${legacyProject.id}` });
      response.end();
      return;
    }
    if (request.url === "/__test_auth_go" && goProject) {
      response.writeHead(302, { "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: `/projects/${goProject.id}` });
      response.end();
      return;
    }
    if (request.url === "/__test_dark") {
      // Embedded documents inherit the iframe's color-scheme for prefers-color-scheme.
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><head><title>Workspace dark-mode check</title><style>html,body{margin:0;background:#111827}iframe{display:block;width:100%;height:100vh;border:0;color-scheme:dark}</style></head><body><iframe title="Workspace dark-mode check" src="/projects/${project.id}"></iframe></body></html>`);
      return;
    }
    const upstream = httpRequest({ hostname: "127.0.0.1", port: nextPort, path: request.url, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${proxyPort}`, "x-forwarded-host": `127.0.0.1:${proxyPort}` } }, (remote) => {
      response.writeHead(remote.statusCode ?? 502, remote.headers);
      remote.pipe(response);
    });
    upstream.on("error", (error) => { if (!response.headersSent) response.writeHead(502); response.end(error.message); });
    request.pipe(upstream);
  });
  await listen(proxy, proxyPort);
  let busy = false;
  const ticker = setInterval(() => {
    if (busy || workerPaused) return;
    busy = true;
    void Promise.all([
      processPendingWorkspaceTasks({ projectId: project.id, limit: 1 }),
      processPendingWorkspaceTasks({ projectId: secondaryProject.id, limit: 1 }),
      ...(goProject ? [processPendingWorkspaceTasks({ projectId: goProject.id, limit: 1 })] : []),
    ]).catch((error) => console.error("Fixture worker error:", error)).finally(() => { busy = false; });
  }, 1000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(ticker);
    next.kill("SIGTERM");
    await Promise.all([new Promise<void>((resolve) => proxy.close(() => resolve())), new Promise<void>((resolve) => modelServer.close(() => resolve()))]);
    if (legacyThread) {
      const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
      await checkpointer.deleteThread(legacyThread.id);
      await checkpointer.end();
    }
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => { void stop(); });
  process.once("SIGTERM", () => { void stop(); });
  process.stdout.write(`BROWSER_FIXTURE_URL=${baseUrl}/__test_auth\nDARK_MODE_URL=${baseUrl}/__test_dark\nSECONDARY_URL=${baseUrl}/__test_auth_secondary\n${legacyProject ? `LEGACY_URL=${baseUrl}/__test_auth_legacy\nLEGACY_PROJECT_ID=${legacyProject.id}\n` : ""}${goProject ? `GO_URL=${baseUrl}/__test_auth_go\nGO_PROJECT_ID=${goProject.id}\n` : ""}${interrupted ? `RECOVERY_WORKSPACE_ID=${interrupted.workspaceId}\nRECOVERY_RUN_ID=${interrupted.runId}\nRESUME_WORKER_URL=${baseUrl}/__test_resume_worker\n` : ""}PROJECT_ID=${project.id}\nSECONDARY_PROJECT_ID=${secondaryProject.id}\nPRIVATE_PROJECT_ID=${privateProject.id}\n`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
