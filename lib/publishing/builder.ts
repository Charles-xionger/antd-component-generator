import { build } from "esbuild";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ArtifactFileInput } from "@/lib/projects/artifact-service";

const ALLOWED_IMPORTS = [
  "react",
  "react-dom",
  "antd",
  "@ant-design/icons",
  "lucide-react",
  "react-i18next",
  "i18next",
  "@tanstack/react-query",
  "recharts",
  "zod",
  "react-hook-form",
];

function validatePath(filePath: string) {
  const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
  if (
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.includes("/../")
  ) {
    throw new Error(`不安全的文件路径: ${filePath}`);
  }
  return normalized;
}

function validateImports(files: ArtifactFileInput[]) {
  const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
  for (const file of files) {
    for (const match of file.content.matchAll(importPattern)) {
      const source = match[1];
      if (source.startsWith(".") || source.startsWith("/")) continue;
      const allowed = ALLOWED_IMPORTS.some(
        (entry) => source === entry || source.startsWith(`${entry}/`),
      );
      if (!allowed) throw new Error(`不允许的依赖: ${source}`);
    }
  }
}

function isAllowedImport(source: string) {
  return ALLOWED_IMPORTS.some(
    (entry) => source === entry || source.startsWith(`${entry}/`),
  );
}

export async function buildPublishedApp(
  files: ArtifactFileInput[],
  outputDirectory: string,
) {
  validateImports(files);
  const appFile = files.find(
    (file) => file.path === "App.tsx" || file.path.endsWith("/App.tsx"),
  );
  if (!appFile) throw new Error("项目缺少 App.tsx");

  const sourceRoot = path.join(outputDirectory, ".source");
  await mkdir(sourceRoot, { recursive: true });
  for (const file of files) {
    const filePath = path.join(sourceRoot, validatePath(file.path));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
  }

  const appImport = `./${validatePath(appFile.path).replace(/\.(tsx|ts|jsx|js)$/, "")}`;
  await writeFile(
    path.join(sourceRoot, "__published_entry.tsx"),
    `import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify(appImport)};
import "./__published_base.css";
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);`,
    "utf8",
  );
  await writeFile(
    path.join(sourceRoot, "__published_base.css"),
    "html,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}",
    "utf8",
  );

  const result = await build({
    absWorkingDir: sourceRoot,
    entryPoints: ["__published_entry.tsx"],
    bundle: true,
    minify: true,
    splitting: false,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    // 源文件位于临时目录，显式回到应用自己的依赖目录解析白名单包。
    nodePaths: [path.join(process.cwd(), "node_modules")],
    plugins: [
      {
        name: "published-import-allowlist",
        setup(buildApi) {
          buildApi.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === "entry-point" || args.path.startsWith(".")) {
              return undefined;
            }
            if (args.path.startsWith("/")) {
              return { errors: [{ text: `不允许的绝对路径导入: ${args.path}` }] };
            }
            if (!isAllowedImport(args.path)) {
              return { errors: [{ text: `不允许的依赖: ${args.path}` }] };
            }
            return undefined;
          });
        },
      },
    ],
    outfile: path.join(outputDirectory, "app.js"),
    loader: { ".ts": "ts", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx" },
    sourcemap: false,
    logLevel: "silent",
    metafile: true,
  });

  const bytes = Object.values(result.metafile.outputs).reduce(
    (sum, output) => sum + output.bytes,
    0,
  );
  if (bytes > 8 * 1024 * 1024) throw new Error("发布产物超过 8 MiB 限制");

  const js = await readFile(path.join(outputDirectory, "app.js"));
  const jsName = `app.${createHash("sha256").update(js).digest("hex").slice(0, 12)}.js`;
  await rename(path.join(outputDirectory, "app.js"), path.join(outputDirectory, jsName));

  let cssLink = "";
  try {
    await stat(path.join(outputDirectory, "app.css"));
    const css = await readFile(path.join(outputDirectory, "app.css"));
    const cssName = `app.${createHash("sha256").update(css).digest("hex").slice(0, 12)}.css`;
    await rename(
      path.join(outputDirectory, "app.css"),
      path.join(outputDirectory, cssName),
    );
    cssLink = `<link rel="stylesheet" href="/${cssName}"/>`;
  } catch {
    // CSS output is optional when the generated project has no stylesheets.
  }

  await rm(sourceRoot, { recursive: true, force: true });

  await writeFile(
    path.join(outputDirectory, "index.html"),
    `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>Published App</title>${cssLink}</head><body><div id="root"></div><script type="module" src="/${jsName}"></script></body></html>`,
    "utf8",
  );
}
