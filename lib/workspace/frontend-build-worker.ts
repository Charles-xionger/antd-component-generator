import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildPublishedApp } from "@/lib/publishing/builder";

async function collect(directory: string, prefix = ""): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(target, relative));
    else if (entry.isFile()) files.push({ path: relative, content: await readFile(target, "utf8") });
  }
  return files;
}

async function main() {
  const root = process.argv[2];
  const output = process.argv[3];
  if (!root || !output) throw new Error("Missing build directories");
  const files = await collect(path.join(root, "frontend"));
  await buildPublishedApp(files, output);
  process.stdout.write("WORKSPACE_BUILD_RESULT " + JSON.stringify({ ok: true }) + "\n");
}

main().catch((error: unknown) => {
  const failure = error as { message?: string; errors?: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } }> };
  process.stdout.write("WORKSPACE_BUILD_RESULT " + JSON.stringify({ ok: false, message: failure.message ?? String(error), errors: failure.errors ?? [] }) + "\n");
  process.exitCode = 1;
});
