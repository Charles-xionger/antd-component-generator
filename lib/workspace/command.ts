import { spawn } from "node:child_process";

export type CommandResult = {
  exitCode: number | null;
  output: string;
  outputTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
};

// Internal primitive only. Agent-facing commands must use a fixed allowlist;
// never pass model-supplied executable names, argv or environment here.
export function runBoundedProcess(executable: string, args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
}): Promise<CommandResult> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000 || !Number.isInteger(options.maxOutputBytes) || options.maxOutputBytes < 1 || options.maxOutputBytes > 256_000) {
    throw new Error("Invalid command limits");
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? { PATH: globalThis.process.env.PATH, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"] as const,
      detached: globalThis.process.platform !== "win32",
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let outputTruncated = false;
    let timedOut = false;
    let spawnError: string | undefined;
    const stop = () => {
      if (!child.pid) return;
      try {
        if (globalThis.process.platform !== "win32") globalThis.process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* Already exited. */ }
    };
    const capture = (data: Buffer) => {
      const remaining = options.maxOutputBytes - bytes;
      if (remaining > 0) {
        const chunk = data.subarray(0, remaining);
        chunks.push(chunk);
        bytes += chunk.length;
      }
      if (data.length > remaining) {
        outputTruncated = true;
        stop();
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs);
    child.on("error", (error) => { spawnError = error.message; });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      resolve({ exitCode, output: output || spawnError || "", outputTruncated, timedOut, durationMs: Date.now() - started });
    });
  });
}
