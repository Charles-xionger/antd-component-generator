import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
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
  const i18nFile = files.find(
    (file) => file.path === "i18n.ts" || file.path.endsWith("/i18n.ts"),
  );
  const i18nImport = i18nFile
    ? `import { i18n_resources as publishedResources } from ${JSON.stringify(
        `./${validatePath(i18nFile.path).replace(/\.(tsx|ts|jsx|js)$/, "")}`,
      )};`
    : `const publishedResources = {
  en: { translation: {} },
  zh: { translation: {} },
};`;
  await writeFile(
    path.join(sourceRoot, "__published_entry.tsx"),
    `import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from ${JSON.stringify(appImport)};
import "./__published_base.css";
${i18nImport}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
const language = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});
const renderApp = () => createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={language === "zh" ? zhCN : enUS}>
        <App />
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
void i18n
  .use(initReactI18next)
  .init({
    resources: publishedResources,
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })
  .then(renderApp)
  .catch((error) => {
    console.error("Failed to initialize published app i18n", error);
    renderApp();
  });`,
    "utf8",
  );
  const tailwindResult = await postcss([
    tailwindcss({ base: process.cwd(), optimize: true }),
  ]).process(
    `@import "tailwindcss" source(none);\n@source ${JSON.stringify(
      sourceRoot.replaceAll("\\", "/"),
    )};`,
    { from: path.join(process.cwd(), "published-app.css") },
  );
  await writeFile(
    path.join(sourceRoot, "__published_base.css"),
    `${tailwindResult.css}\nhtml,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}`,
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
    jsx: "automatic",
    jsxImportSource: "react",
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
            // 白名单约束平台接收的用户源码。已进入 node_modules 后的
            // 间接依赖由锁定的生产镜像负责信任和复现。
            const importer = args.importer ? path.resolve(args.importer) : "";
            if (
              importer &&
              importer !== sourceRoot &&
              !importer.startsWith(`${sourceRoot}${path.sep}`)
            ) {
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
