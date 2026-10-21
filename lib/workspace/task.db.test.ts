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
