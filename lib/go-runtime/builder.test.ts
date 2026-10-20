import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assembleGoApplication } from "./builder";
import { validateFullstackArtifact } from "./artifact-validator";

const run = promisify(execFile);

test("assembles a buildable Go application with embedded React", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "prompt-go-app-"));
  try {
    await assembleGoApplication([
      { path: "frontend/App.tsx", content: "export default function App(){return <main>ok</main>}" },
      { path: "backend/operations.go", content: `package backend
import ("context"; "encoding/json"; "log/slog"; "github.com/jackc/pgx/v5/pgxpool")
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation {
  return map[string]Operation{"health.query": func(_ context.Context, _ json.RawMessage) (any, error) { return map[string]bool{"ok": true}, nil }}
}` },
      { path: "migrations/0001_init.sql", content: "CREATE TABLE work_logs (id uuid PRIMARY KEY, hours numeric NOT NULL CHECK (hours >= 0));" },
      { path: "acceptance/scenarios.json", content: "[]" },
    ], output);
    assert.match(await readFile(path.join(output, "frontend", "dist", "index.html"), "utf8"), /app\.[a-f0-9]{12}\.js/);
    await run("go", ["test", "./..."], { cwd: output });
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("builds the AIGC storyboard productivity acceptance application", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "prompt-storyboard-app-"));
  const fixtureRoot = path.join(process.cwd(), "test", "fixtures", "aigc-storyboard-productivity");
  const fixturePaths = [
    "frontend/App.tsx",
    "frontend/runtime.d.ts",
    "backend/register.go",
    "migrations/0001_init.sql",
    "acceptance/seed.json",
    "acceptance/scenarios.json",
  ];
  try {
    const files = await Promise.all(fixturePaths.map(async (filePath) => ({
      path: filePath,
      content: await readFile(path.join(fixtureRoot, filePath), "utf8"),
    })));
    assert.deepEqual(validateFullstackArtifact(files), []);
    await assembleGoApplication(files, output);
    await run("go", ["test", "./..."], { cwd: output });
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
