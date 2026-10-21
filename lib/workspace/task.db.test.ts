import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import prisma from "@/lib/database/prisma";
import { createAgentRun } from "./agent-run";
import { listAgentEvents } from "./events";
import { createDraftWorkspace } from "./service";
import { executeWorkspaceTask } from "./task";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const userId = randomUUID();
const projectId = randomUUID();

before(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.create({ data: { id: userId, email: `${userId}@workspace-task.test` } });
  await prisma.project.create({ data: { id: projectId, userId, name: "Workspace task test", slug: `task-${projectId}` } });
});

after(async () => {
  if (!process.env.DATABASE_URL) return;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

dbTest("first generation and later modification share a tool loop and commit full snapshots", async () => {
  const initial = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const initialRun = await createAgentRun({ workspaceId: initial.id, userId, requestId: randomUUID(), goal: "Create a page", runtimeType: "STATIC" });
  const firstDecisions = [
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return <p>First</p>; }" } },
    { kind: "tool", name: "write_file", arguments: { path: "frontend/styles.css", content: "p { color: red; }" } },
    { kind: "complete", summary: "Page built" },
  ];
  const firstModel = { decide: async ({ step }: { step: number }) => firstDecisions[step] };
  const first = await executeWorkspaceTask({ runId: initialRun.id, userId, model: firstModel });
  assert.equal(first.run.status, "COMMITTED");
  assert.equal(first.commit?.version.versionNumber, 1);
  assert.deepEqual(first.commit?.version.files.map((file) => file.path).sort(), ["frontend/App.tsx", "frontend/styles.css"]);
  assert.equal(first.commit?.previewJob, null);
  const eventPage = await listAgentEvents({ runId: initialRun.id, userId, limit: 100 });
  assert.deepEqual(eventPage.events.map((event) => event.sequence), eventPage.events.map((_, index) => index + 1));
  assert.equal(eventPage.events.filter((event) => event.type === "file.changed").length, 2);
  assert.equal(eventPage.events.at(-1)?.type, "artifact.committed");
  const resumedEvents = await listAgentEvents({ runId: initialRun.id, userId, after: eventPage.events[2].sequence });
  assert.ok(resumedEvents.events.every((event) => event.sequence > eventPage.events[2].sequence));
  await assert.rejects(listAgentEvents({ runId: initialRun.id, userId: randomUUID() }), { code: "NOT_FOUND" });
  const repeated = await executeWorkspaceTask({ runId: initialRun.id, userId, model: { decide: async () => { throw new Error("Model must not be called again"); } } });
  assert.equal(repeated.commit?.version.id, first.commit?.version.id);

  const modified = await createDraftWorkspace({ projectId, userId, taskId: randomUUID(), baseArtifactVersionId: first.commit!.version.id });
  const modifyRun = await createAgentRun({ workspaceId: modified.id, userId, requestId: randomUUID(), goal: "Change First to Second", runtimeType: "STATIC" });
  const modifyDecisions = [
    { kind: "tool", name: "read_file", arguments: { path: "frontend/App.tsx" } },
    { kind: "tool", name: "patch_file", arguments: { path: "frontend/App.tsx", oldText: "First", newText: "Second" } },
    { kind: "complete", summary: "Text changed" },
  ];
  const changed = await executeWorkspaceTask({ runId: modifyRun.id, userId, model: { decide: async ({ step }: { step: number }) => modifyDecisions[step] } });
  assert.equal(changed.run.status, "COMMITTED");
  assert.equal(changed.commit?.version.versionNumber, 2);
  assert.equal(changed.commit?.version.files.find((file) => file.path === "frontend/styles.css")?.content, "p { color: red; }");
  assert.match(changed.commit!.version.files.find((file) => file.path === "frontend/App.tsx")!.content, /Second/);
  assert.equal(await prisma.draftFileChange.count({ where: { workspaceId: modified.id } }), 1);
});

dbTest("Go acceptance root failure is diagnosed and repaired without rewriting passed files", async () => {
  const workspace = await createDraftWorkspace({ projectId, userId, taskId: randomUUID() });
  const blueprint = {
    blueprintVersion: 1, runtimeType: "GO",
    product: { name: "Items", goal: "Read an item", actors: ["User"], workflows: ["Read item"], acceptanceCriteria: ["Returns item"] },
    pages: [], entities: [], operations: [{ id: "get.item", method: "GET", path: "/api/items", description: "Get item" }],
  };
  const run = await createAgentRun({ workspaceId: workspace.id, userId, requestId: randomUUID(), goal: "Create a Go app", runtimeType: "GO", appBlueprint: blueprint });
  const backend = `package backend
import (
  "context"
  "encoding/json"
  "log/slog"
  "github.com/jackc/pgx/v5/pgxpool"
)
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation {
  return map[string]Operation{"get.item": func(_ context.Context, _ json.RawMessage) (any, error) { return map[string]any{"ok": true}, nil }}
}`;
  const scenarios = [{ id: "get.item", description: "Get an item", steps: [{ operationId: "get.item", expectStatus: 200 }] }];
  const decisions = [
    { kind: "tool", name: "write_file", arguments: { path: "migrations/001_init.sql", content: "CREATE TABLE items (id int);" } },
    { kind: "tool", name: "write_file", arguments: { path: "backend/operations.go", content: backend } },
    { kind: "tool", name: "write_file", arguments: { path: "acceptance/seed.json", content: "{}" } },
    { kind: "tool", name: "write_file", arguments: { path: "frontend/App.tsx", content: "export default function App() { return <div>Ready</div>; }" } },
    { kind: "tool", name: "write_file", arguments: { path: "acceptance/scenarios.json", content: "[]" } },
    { kind: "complete", summary: "Initial files ready" },
    { kind: "tool", name: "read_file", arguments: { path: "acceptance/scenarios.json" } },
    { kind: "tool", name: "write_scenarios", arguments: { scenarios } },
    { kind: "complete", summary: "Acceptance repaired" },
  ];
  const result = await executeWorkspaceTask({ runId: run.id, userId, model: { decide: async ({ step, previousResult }: { step: number; previousResult: unknown }) => {
    if (step === 6) {
      const validation = (previousResult as { validation?: { diagnostics?: Array<{ code?: string; path?: string; expected?: string; actual?: string }> } })?.validation;
      assert.deepEqual(validation?.diagnostics?.map(({ code, path, expected, actual }) => ({ code, path, expected, actual })), [{
        code: "SCENARIO_SUITE_ROOT_TYPE", path: "$", expected: "object with scenarios array", actual: "array",
      }]);
    }
    return decisions[step];
  } } });
  assert.equal(result.run.status, "COMMITTED");
  const changes = await prisma.draftFileChange.findMany({ where: { workspaceId: workspace.id }, orderBy: { revision: "asc" } });
  assert.deepEqual(changes.map((change) => change.path), [
    "migrations/001_init.sql", "backend/operations.go", "acceptance/seed.json", "frontend/App.tsx", "acceptance/scenarios.json", "acceptance/scenarios.json",
  ]);
  assert.equal(result.commit?.version.files.find((file) => file.path === "backend/operations.go")?.content, backend);
  assert.deepEqual(JSON.parse(result.commit!.version.files.find((file) => file.path === "acceptance/scenarios.json")!.content), {
    scenarios: [{ ...scenarios[0], steps: [{ ...scenarios[0].steps[0], input: {}, assertions: [] }] }],
  });
  const events = await listAgentEvents({ runId: run.id, userId, limit: 100 });
  assert.equal(events.events.filter((event) => event.type === "diagnostic.created").length, 1);
  assert.equal(events.events.at(-1)?.type, "artifact.committed");
});
