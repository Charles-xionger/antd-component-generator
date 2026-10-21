import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";

const appDir = process.cwd();
for (const candidate of [path.resolve(appDir, ".env"), path.resolve(appDir, "../../../.env")]) {
  if (existsSync(candidate)) loadEnv({ path: candidate, override: false, quiet: true });
}
const sandboxCandidates = [
  process.env.SANDBOX_DIR,
  path.resolve(appDir, "../antd-sandbox"),
  path.resolve(appDir, "../../../antd-sandbox"),
].filter(Boolean);
const sandboxDir = sandboxCandidates.find((candidate) => existsSync(path.join(candidate, "package.json")));

if (!sandboxDir) {
  console.error("[dev:all] Cannot find the antd-sandbox repository. Set SANDBOX_DIR to its absolute path.");
  process.exit(1);
}

const definitions = [
  { name: "web", cwd: appDir, args: ["dev"] },
  { name: "workspace-agent", cwd: appDir, args: ["worker:agent"] },
  { name: "build-worker", cwd: appDir, args: ["worker:build"] },
  { name: "sandbox", cwd: sandboxDir, args: ["dev", "--host", "127.0.0.1"] },
];

let stopping = false;
const children = definitions.map((definition) => {
  console.log(`[dev:all] starting ${definition.name}`);
  const child = spawn("pnpm", definition.args, { cwd: definition.cwd, env: process.env, stdio: "inherit" });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    stopping = true;
    console.error(`[dev:all] ${definition.name} stopped (${signal || code}); stopping the remaining services.`);
    for (const sibling of children) if (sibling !== child && !sibling.killed) sibling.kill("SIGTERM");
    process.exitCode = code || 1;
  });
  return child;
});

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
