import path from "node:path";
import { writeFile } from "node:fs/promises";
import ts from "typescript";
import type { WorkspaceDiagnostic } from "./diagnostics";
import { materializeWorkspaceFiles } from "./projection";

type FrontendFile = { path: string; content: string };

export async function typecheckFrontend(files: FrontendFile[]): Promise<WorkspaceDiagnostic[]> {
  const source = files.filter((file) => file.path.startsWith("frontend/") && /\.[cm]?[jt]sx?$/.test(file.path));
  if (!source.length) return [];
  const projection = await materializeWorkspaceFiles(source);
  try {
    const runtimeTypes = path.join(projection.directory, "__prompt_web_app_runtime.d.ts");
    await writeFile(runtimeTypes, `declare module "@prompt-web/app-runtime" {
  export function invoke<T = unknown>(operationId: string, input?: Record<string, unknown>): Promise<T>;
}\n`, "utf8");
    const rootNames = [...source.map((file) => path.join(projection.directory, file.path)), runtimeTypes];
    const options: ts.CompilerOptions = {
      noEmit: true, strict: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, esModuleInterop: true,
      allowSyntheticDefaultImports: true, allowJs: true,
      typeRoots: [path.join(process.cwd(), "node_modules/@types")],
    };
    const host = ts.createCompilerHost(options);
    host.resolveModuleNames = (names, containingFile) => names.map((name) => {
      const resolutionBase = name.startsWith(".") ? containingFile : path.join(process.cwd(), "__workspace__.tsx");
      return ts.resolveModuleName(name, resolutionBase, options, host).resolvedModule;
    });
    const program = ts.createProgram(rootNames, options, host);
    return ts.getPreEmitDiagnostics(program).slice(0, 100).map((issue) => {
      const position = issue.file && issue.start !== undefined ? issue.file.getLineAndCharacterOfPosition(issue.start) : undefined;
      const absolute = issue.file?.fileName.replaceAll("\\", "/");
      const prefix = `${projection.directory.replaceAll("\\", "/")}/`;
      const file = absolute?.startsWith(prefix) ? absolute.slice(prefix.length) : undefined;
      const code = `TS${issue.code}`;
      const message = ts.flattenDiagnosticMessageText(issue.messageText, "\n").slice(0, 4096);
      return {
        id: `typescript:${code}:${file ?? "workspace"}:${position?.line ?? ""}:${position?.character ?? ""}`,
        source: "typescript" as const, severity: "error" as const, code, file,
        line: position ? position.line + 1 : undefined, column: position ? position.character + 1 : undefined,
        message, raw: message,
      };
    });
  } finally {
    await projection.dispose();
  }
}
