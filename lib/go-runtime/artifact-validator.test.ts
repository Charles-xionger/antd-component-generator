import assert from "node:assert/strict";
import test from "node:test";
import { appBlueprintSchema } from "@/lib/app-contracts";
import {
  validateFullstackArtifact,
  validateGeneratedArtifact,
  validateStaticArtifact,
} from "./artifact-validator";

const staticBlueprint = appBlueprintSchema.parse({
  blueprintVersion: 1,
  runtimeType: "STATIC",
  product: {
    name: "产品展示",
    goal: "展示产品",
    actors: ["访客"],
    workflows: ["浏览产品"],
    acceptanceCriteria: ["可以浏览"],
  },
  pages: [{ id: "home", title: "首页", route: "/", operations: [] }],
  entities: [],
  operations: [],
  businessRules: [],
  dataEvolution: [],
  testScenarios: [],
});

test("accepts a complete static bolt artifact", () => {
  const source = `<boltArtifact id="app" title="App">
<boltAction type="file" filePath="frontend/App.tsx">export default function App() { return null }</boltAction>
</boltArtifact>`;
  const files = [
    {
      path: "frontend/App.tsx",
      content: "export default function App() { return null }",
    },
  ];
  assert.deepEqual(validateStaticArtifact(source, files), []);
  assert.deepEqual(validateGeneratedArtifact(source, files, staticBlueprint), []);
});

test("rejects markdown code that was never packaged as an artifact", () => {
  const source = "```tsx\nexport default function App() { return null }\n```";
  const errors = validateGeneratedArtifact(source, [], staticBlueprint);
  assert.ok(errors.some((error) => error.includes("缺少 <boltArtifact>")));
  assert.ok(errors.some((error) => error.includes("缺少 frontend/App.tsx")));
});

test("rejects static files outside frontend and missing envelope closure", () => {
  const source = `<boltArtifact id="app" title="App">
<boltAction type="file" filePath="App.tsx">export default function App() { return null }</boltAction>`;
  const errors = validateStaticArtifact(source, [
    { path: "App.tsx", content: "export default function App() { return null }" },
  ]);
  assert.ok(errors.some((error) => error.includes("闭合标签")));
  assert.ok(errors.some((error) => error.includes("只允许 frontend/")));
});

const baseFiles = [
  { path: "frontend/App.tsx", content: "export default function App() { return null }" },
  { path: "backend/register.go", content: `package backend
import (
  "log/slog"
  "net/http"
  "github.com/jackc/pgx/v5/pgxpool"
)
func Register(*http.ServeMux, *pgxpool.Pool, *slog.Logger) {}` },
  { path: "migrations/001_init.sql", content: "CREATE TABLE work_logs (id UUID PRIMARY KEY);" },
  { path: "acceptance/seed.json", content: "{}" },
  { path: "acceptance/scenarios.json", content: JSON.stringify({ scenarios: [{
    id: "health.flow",
    description: "basic operation flow",
    steps: [{ operationId: "dashboard.query", input: {}, expectStatus: 200, assertions: [] }],
  }] }) },
];

test("accepts standard library and pgx imports", () => {
  assert.deepEqual(validateFullstackArtifact(baseFiles), []);
});

test("rejects unapproved and process execution imports", () => {
  const files = baseFiles.map((file) => file.path === "backend/register.go"
    ? { ...file, content: `package backend
import (
  "os/exec"
  "example.com/unapproved/client"
)
func Register() {}` }
    : file);
  const errors = validateFullstackArtifact(files);
  assert.ok(errors.some((error) => error.includes("禁止导入 os/exec")));
  assert.ok(errors.some((error) => error.includes("不允许的第三方 Go 依赖 example.com/unapproved/client")));
});

test("rejects unused standard-library imports before the Docker build", () => {
  const files = baseFiles.map((file) => file.path === "backend/register.go"
    ? { ...file, content: file.content.replace('import (', 'import (\n  "context"') }
    : file);
  const errors = validateFullstackArtifact(files);
  assert.ok(errors.some((error) => error.includes("Go import context 未使用")));
});

test("rejects a dispatcher that expects operationId in the request body", () => {
  const files = baseFiles.map((file) => file.path === "backend/register.go"
    ? { ...file, content: `package backend
import ("encoding/json"; "log/slog"; "net/http"; "github.com/jackc/pgx/v5/pgxpool")
type request struct { OperationID string }
func Register(mux *http.ServeMux, _ *pgxpool.Pool, _ *slog.Logger) {
  mux.HandleFunc("POST /api/operations/{operationId}", func(w http.ResponseWriter, r *http.Request) {
    var req request
    _ = json.NewDecoder(r.Body).Decode(&req)
    _ = req.OperationID
  })
}` }
    : file);
  const errors = validateFullstackArtifact(files);
  assert.ok(errors.some((error) => error.includes("PathValue")));
  assert.ok(errors.some((error) => error.includes("请求体读取 operationId")));
});

test("accepts the platform-owned Operations contract", () => {
  const files = baseFiles
    .filter((file) => file.path !== "backend/register.go")
    .concat({ path: "backend/operations.go", content: `package backend
import ("log/slog"; "github.com/jackc/pgx/v5/pgxpool")
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation { return map[string]Operation{} }` });
  assert.deepEqual(validateFullstackArtifact(files), []);
});

test("rejects acceptance steps and handlers that drift from the Blueprint contract", () => {
  const blueprint = appBlueprintSchema.parse({
    blueprintVersion: 1,
    runtimeType: "GO",
    product: { name: "名单", goal: "管理名单", actors: ["用户"], workflows: ["新增名单"], acceptanceCriteria: ["可以新增"] },
    pages: [{ id: "home", title: "名单", route: "/", operations: ["user.create"] }],
    entities: [{ id: "user", table: "users", description: "用户", fields: [{ name: "id", type: "uuid", required: true }] }],
    operations: [{ id: "user.create", method: "POST", path: "/api/users", description: "新增", inputSchema: {}, outputSchema: {} }],
    testScenarios: [{ id: "create", description: "新增", expected: "成功" }],
  });
  const files = baseFiles
    .filter((file) => file.path !== "backend/register.go")
    .map((file) => file.path === "acceptance/scenarios.json"
      ? { ...file, content: JSON.stringify({ scenarios: [{ id: "bad.operation", description: "错误契约", steps: [{ operationId: "user.remove", input: {}, expectStatus: 200 }] }] }) }
      : file)
    .concat({ path: "backend/operations.go", content: `package backend
import ("log/slog"; "github.com/jackc/pgx/v5/pgxpool")
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation { return map[string]Operation{} }` });
  const errors = validateFullstackArtifact(files, blueprint);
  assert.ok(errors.some((error) => error.includes("未知 operationId user.remove")));
  assert.ok(errors.some((error) => error.includes("未注册 operationId user.create")));
});

test("rejects a foreign key that references a table created later", () => {
  const files = baseFiles.map((file) => file.path === "migrations/001_init.sql"
    ? { ...file, content: `
CREATE TABLE people (
  id UUID PRIMARY KEY,
  current_group_id UUID REFERENCES groups(id)
);
CREATE TABLE groups (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES people(id)
);` }
    : file);
  const errors = validateFullstackArtifact(files);
  assert.ok(errors.some((error) => error.includes("外键引用 groups 早于建表")));
});

test("allows cyclic foreign keys when the deferred constraint is added after both tables", () => {
  const files = baseFiles.map((file) => file.path === "migrations/001_init.sql"
    ? { ...file, content: `
CREATE TABLE people (
  id UUID PRIMARY KEY,
  current_group_id UUID
);
CREATE TABLE groups (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES people(id)
);
ALTER TABLE people
  ADD CONSTRAINT people_current_group_fk
  FOREIGN KEY (current_group_id) REFERENCES groups(id);` }
    : file);
  assert.deepEqual(validateFullstackArtifact(files), []);
});
