# Workspace Agent API (P0)

All routes require an authenticated project owner. Unknown or foreign workspace/run IDs return `404`; the API never accepts model-authored file changes or events.

- `POST /api/workspaces` — queue a task. Body: exactly one of `projectId` (new Draft) or `workspaceId` (new run on an existing Draft), plus `requestId`, `goal`, `runtimeType` (`STATIC`/`GO`), and optional `baseArtifactVersionId`, `modelName`, `requirementSpec`, `appBlueprint`, `maxSteps`. A repeated request ID returns the same run; conflicting arguments return `409`. This route does not run the model in the HTTP request; the background worker claims queued runs.
- `GET /api/workspaces/:workspaceId` — Draft metadata and latest run summary.
- `GET /api/workspaces/:workspaceId/files?revision=N` — file list at a fixed revision. Add `path=frontend%2FApp.tsx` to read one file's content. The path is validated by the workspace service.
- `GET /api/workspaces/:workspaceId/runs/:runId` — run status, summary, IDs, and latest event cursor.
- `POST /api/workspaces/:workspaceId/runs/:runId/cancel` — stop queued/running work; the Draft remains available.
- `GET /api/workspaces/:workspaceId/runs/:runId/events?after=N&limit=M` — ordered JSON event page (`sequence > after`, at most 100). The response includes `nextCursor` and `hasMore` and has `Cache-Control: no-store`. A reconnect uses the last observed sequence; it does not replay a model response or XML artifact.

The events endpoint is cursor-paginated JSON rather than a long-lived SSE connection. The UI can poll it and deduplicate by sequence; an SSE adapter can be added without changing the stored event contract.
