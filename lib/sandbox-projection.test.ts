import assert from "node:assert/strict";
import test from "node:test";

import { projectArtifactForSandbox } from "./sandbox-projection";

const fullstackFiles = [
  { path: "frontend/App.tsx", content: "export default function App() {}" },
  { path: "frontend/components/Board.tsx", content: "export function Board() {}" },
  { path: "backend/operations.go", content: "package backend" },
  { path: "migrations/001_init.sql", content: "CREATE TABLE tasks ();" },
  { path: "acceptance/scenarios.json", content: "[]" },
];

test("projects only frontend files into the browser sandbox for a Go artifact", () => {
  assert.deepEqual(projectArtifactForSandbox(fullstackFiles, "go-1.24"), {
    files: {
      "App.tsx": "export default function App() {}",
      "components/Board.tsx": "export function Board() {}",
    },
    entryFile: "App.tsx",
  });
});

test("keeps legacy root files for static artifacts", () => {
  assert.deepEqual(projectArtifactForSandbox([
    { path: "App.tsx", content: "export default function App() {}" },
    { path: "helpers.ts", content: "export const value = 1" },
  ]), {
    files: {
      "App.tsx": "export default function App() {}",
      "helpers.ts": "export const value = 1",
    },
    entryFile: "App.tsx",
  });
});

