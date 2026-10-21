import type { ArtifactFileInput } from "@/lib/projects/artifact-service";
import { acceptanceScenarioSuiteSchema, type AppBlueprint } from "@/lib/app-contracts";
import { validateForwardOnlyMigration } from "./schema";

const ALLOWED_EXTERNAL_GO_IMPORTS = ["github.com/jackc/pgx/v5"];
const FORBIDDEN_GO_IMPORTS = new Set(["os/exec", "plugin", "syscall", "unsafe"]);

function validateGoImports(path: string, source: string) {
  const errors: string[] = [];
  const importDeclarations = source.matchAll(/\bimport\s*(?:\(([\s\S]*?)\)|(?:[\w.]+\s+)?"([^"]+)")/gm);

  for (const declaration of importDeclarations) {
    const imports = declaration[2]
      ? [declaration[2]]
      : [...(declaration[1] ?? "").matchAll(/(?:^|\s)(?:[\w.]+\s+)?"([^"]+)"/gm)].map((match) => match[1]);
    for (const imported of imports) {
      if (FORBIDDEN_GO_IMPORTS.has(imported)) errors.push(`${path}: 禁止导入 ${imported}`);
      if (imported.includes(".") && !ALLOWED_EXTERNAL_GO_IMPORTS.some((allowed) => imported === allowed || imported.startsWith(`${allowed}/`))) {
        errors.push(`${path}: 不允许的第三方 Go 依赖 ${imported}`);
      }
    }
  }

  return errors;
}

function validateUnusedStandardImports(path: string, source: string) {
  const errors: string[] = [];
  const declarations = [...source.matchAll(/\bimport\s*(?:\(([\s\S]*?)\)|(?:[\w.]+\s+)?"([^"]+)")/gm)];
  const sourceWithoutImports = source.replace(/\bimport\s*(?:\([\s\S]*?\)|(?:[\w.]+\s+)?"[^"]+")/gm, "");
  for (const declaration of declarations) {
    const entries = declaration[2]
      ? [{ alias: "", imported: declaration[2] }]
      : [...(declaration[1] ?? "").matchAll(/(?:^|\s)(?:([\w.]+)\s+)?"([^"]+)"/gm)].map((match) => ({ alias: match[1] || "", imported: match[2] }));
    for (const { alias, imported } of entries) {
      // External modules may expose a package name different from the final path
      // segment. The real compiler remains authoritative for those dependencies.
      if (imported.includes(".") || alias === "_" || alias === ".") continue;
      const identifier = alias || imported.split("/").at(-1) || imported;
      if (!new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(sourceWithoutImports)) {
        errors.push(`${path}: Go import ${imported} 未使用`);
      }
    }
  }
  return errors;
}

function validateBackendContract(files: ArtifactFileInput[]) {
  const errors: string[] = [];
  const operations = files.find((file) => file.path === "backend/operations.go");
  const legacyRegister = files.find((file) => file.path === "backend/register.go");
  if (operations) {
    if (!/func\s+Operations\s*\(/.test(operations.content)) errors.push("backend/operations.go 未导出 Operations");
    if (legacyRegister) errors.push("平台已提供 HTTP 路由，生成产物不得包含 backend/register.go");
    return errors;
  }
  // Keep already-published V1 artifacts buildable, while rejecting the common
  // broken dispatcher that reads operationId from a JSON body the client never sends.
  if (!legacyRegister) return ["缺少 backend/operations.go"];
  if (!/func\s+Register\s*\(/.test(legacyRegister.content)) errors.push("backend/register.go 未导出 Register");
  if (/\/api\/operations\/\{operationId\}/.test(legacyRegister.content) && !/PathValue\(\s*["']operationId["']\s*\)/.test(legacyRegister.content)) {
    errors.push("backend/register.go 必须从 URL PathValue 读取 operationId，不能从请求体读取");
  }
  if (/\.OperationID\b/.test(legacyRegister.content)) errors.push("backend/register.go 错误地从请求体读取 operationId");
  return errors;
}

function validateForeignKeyCreationOrder(path: string, source: string) {
  const errors: string[] = [];
  const tableCreationOffsets = new Map<string, number>();
  const createTablePattern = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-zA-Z_][\w$]*"?\.)?"?([a-zA-Z_][\w$]*)"?/gi;

  for (const match of source.matchAll(createTablePattern)) {
    tableCreationOffsets.set(match[1].toLowerCase(), match.index ?? 0);
  }

  const referencePattern = /\bREFERENCES\s+(?:"?[a-zA-Z_][\w$]*"?\.)?"?([a-zA-Z_][\w$]*)"?/gi;
  for (const match of source.matchAll(referencePattern)) {
    const referencedTable = match[1].toLowerCase();
    const creationOffset = tableCreationOffsets.get(referencedTable);
    if (creationOffset !== undefined && (match.index ?? 0) < creationOffset) {
      errors.push(`${path}: 外键引用 ${referencedTable} 早于建表；请先创建被引用表，循环依赖请在两张表创建后使用 ALTER TABLE ADD CONSTRAINT`);
    }
  }

  return errors;
}

export function validateFullstackArtifact(files: ArtifactFileInput[], blueprint?: AppBlueprint) {
  const errors: string[] = [];
  const allowed = ["frontend/", "backend/", "migrations/", "acceptance/"];
  for (const file of files) {
    if (!allowed.some((prefix) => file.path.startsWith(prefix))) errors.push(`不允许的文件路径: ${file.path}`);
    if (file.path.includes("..") || file.path.startsWith("/")) errors.push(`不安全的文件路径: ${file.path}`);
    if (file.path.endsWith(".sql")) {
      try { validateForwardOnlyMigration(file.content); } catch (error) { errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`); }
      errors.push(...validateForeignKeyCreationOrder(file.path, file.content));
    }
    if (file.path.startsWith("backend/") && file.path.endsWith(".go")) {
      errors.push(...validateGoImports(file.path, file.content));
      errors.push(...validateUnusedStandardImports(file.path, file.content));
    }
  }
  if (!files.some((file) => file.path === "frontend/App.tsx")) errors.push("缺少 frontend/App.tsx");
  errors.push(...validateBackendContract(files));
  // 版本号允许任意正整数位数（如 001_、0001_）。是否有序由迁移
  // 执行器按文件名管理，不应因补零位数不同拒绝一份有效产物。
  if (!files.some((file) => /^migrations\/\d+_.+\.sql$/.test(file.path))) errors.push("缺少版本化 SQL migration");
  const scenarios = files.find((file) => file.path === "acceptance/scenarios.json");
  if (!scenarios) errors.push("缺少 acceptance/scenarios.json");
  else {
    try {
      const suite = acceptanceScenarioSuiteSchema.parse(JSON.parse(scenarios.content));
      if (blueprint) {
        const operationIds = new Set(blueprint.operations.map((operation) => operation.id));
        for (const scenario of suite.scenarios) {
          for (const step of scenario.steps) {
            if (!operationIds.has(step.operationId)) errors.push(`acceptance/scenarios.json: 未知 operationId ${step.operationId}`);
          }
        }
      }
    }
    catch { errors.push("acceptance/scenarios.json 不符合验收场景契约"); }
  }
  if (blueprint) {
    const backend = files.find((file) => file.path === "backend/operations.go")?.content;
    if (backend) {
      for (const operation of blueprint.operations) {
        if (!backend.includes(JSON.stringify(operation.id))) errors.push(`backend/operations.go 未注册 operationId ${operation.id}`);
      }
    }
  }
  return errors;
}

function validateArtifactEnvelope(source: string) {
  const errors: string[] = [];
  const trimmed = source.trim();
  const artifactCount = (source.match(/<boltArtifact\b/g) || []).length;
  if (artifactCount !== 1) {
    errors.push(
      artifactCount === 0
        ? "生成结果缺少 <boltArtifact>"
        : "生成结果必须且只能包含一个 <boltArtifact>",
    );
  }
  if (!source.includes("</boltArtifact>")) {
    errors.push("生成结果缺少 </boltArtifact> 闭合标签");
  }
  if (!trimmed.startsWith("<boltArtifact") || !trimmed.endsWith("</boltArtifact>")) {
    errors.push("生成结果只能输出完整 boltArtifact，不能使用 Markdown 代码围栏或附加说明");
  }
  return errors;
}

export function validateStaticArtifact(
  source: string,
  files: ArtifactFileInput[],
) {
  const errors = validateArtifactEnvelope(source);
  for (const file of files) {
    if (!file.path.startsWith("frontend/")) {
      errors.push(`静态应用只允许 frontend/ 文件: ${file.path}`);
    }
    if (file.path.includes("..") || file.path.startsWith("/")) {
      errors.push(`不安全的文件路径: ${file.path}`);
    }
  }
  if (!files.some((file) => file.path === "frontend/App.tsx")) {
    errors.push("缺少 frontend/App.tsx");
  }
  return [...new Set(errors)];
}

export function validateGeneratedArtifact(
  source: string,
  files: ArtifactFileInput[],
  blueprint: AppBlueprint,
) {
  const envelopeErrors = validateArtifactEnvelope(source);
  const contentErrors =
    blueprint.runtimeType === "STATIC"
      ? validateStaticArtifact(source, files)
      : validateFullstackArtifact(files, blueprint);
  return [...new Set([...envelopeErrors, ...contentErrors])];
}
