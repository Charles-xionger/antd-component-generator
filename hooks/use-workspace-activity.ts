"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WorkspaceEvent = { sequence: number; type: string; payload: Record<string, unknown> };
type RunView = { id: string; workspaceId: string; status: string; summary: string | null; nextStep: number; maxSteps: number; createdAt?: string; updatedAt?: string };
type WorkspaceView = { id: string; revision: number; status: string };

export function useWorkspaceActivity(projectId?: string, onFiles?: (workspaceId: string, files: Array<{ path: string; content: string }>) => void, onCommitted?: (fresh: boolean) => void) {
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef(0);
  const revisionRef = useRef(-1);
  const committedRef = useRef<string | null>(null);
  const attachedRunRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onFiles, onCommitted });
  useEffect(() => { callbacksRef.current = { onFiles, onCommitted }; });

  const attach = useCallback((workspaceId: string, runId: string) => {
    cursorRef.current = 0;
    revisionRef.current = -1;
    setEvents([]);
    attachedRunRef.current = runId;
    setWorkspace({ id: workspaceId, revision: 0, status: "ACTIVE" });
    const createdAt = new Date().toISOString();
    setRun({ id: runId, workspaceId, status: "QUEUED", summary: null, nextStep: 0, maxSteps: 30, createdAt, updatedAt: createdAt });
    setError(null);
  }, []);

  useEffect(() => {
    cursorRef.current = 0;
    revisionRef.current = -1;
    committedRef.current = null;
    attachedRunRef.current = null;
    setWorkspace(null);
    setRun(null);
    setEvents([]);
    setError(null);
    if (!projectId) return;
    let cancelled = false;
    void fetch(`/api/workspaces?projectId=${encodeURIComponent(projectId)}`)
      .then(async (response) => { if (!response.ok) throw new Error("工作区恢复失败"); return response.json(); })
      .then((data) => {
        if (cancelled || attachedRunRef.current || !data.workspace || !data.run) return;
        setWorkspace(data.workspace);
        setRun(data.run);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [projectId]);

  const workspaceId = workspace?.id;
  const runId = run?.id;
  useEffect(() => {
    if (!workspaceId || !runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const base = `/api/workspaces/${workspaceId}`;
        const [workspaceResponse, eventsResponse] = await Promise.all([
          fetch(base, { cache: "no-store" }),
          fetch(`${base}/runs/${runId}/events?after=${cursorRef.current}`, { cache: "no-store" }),
        ]);
        if (!workspaceResponse.ok || !eventsResponse.ok) throw new Error("工作区事件读取失败");
        const workspaceData = await workspaceResponse.json();
        const eventData = await eventsResponse.json();
        if (cancelled) return;
        const currentWorkspace = workspaceData.workspace as WorkspaceView;
        const currentRun = workspaceData.run as RunView;
        setWorkspace(currentWorkspace);
        if (currentRun?.id === runId) setRun(currentRun);
        const incoming = (eventData.events || []) as WorkspaceEvent[];
        const committed = incoming.some((event) => event.type === "artifact.committed");
        if (incoming.length) {
          cursorRef.current = eventData.nextCursor;
          setEvents((previous) => [...previous, ...incoming].slice(-100));
        }
        if (revisionRef.current !== currentWorkspace.revision) {
          const listResponse = await fetch(`${base}/files`, { cache: "no-store" });
          if (!listResponse.ok) throw new Error("工作区文件读取失败");
          const listing = await listResponse.json();
          const files = await Promise.all((listing.files as Array<{ path: string }>).map(async ({ path }) => {
            const response = await fetch(`${base}/files?path=${encodeURIComponent(path)}&revision=${listing.revision}`, { cache: "no-store" });
            if (!response.ok) throw new Error(`读取 ${path} 失败`);
            return (await response.json()).file as { path: string; content: string };
          }));
          if (!cancelled) {
            revisionRef.current = listing.revision;
            callbacksRef.current.onFiles?.(workspaceId, files);
          }
        }
        if (committed && committedRef.current !== runId) {
          committedRef.current = runId;
          callbacksRef.current.onCommitted?.(attachedRunRef.current === runId);
        }
        setError(null);
      } catch (reason) {
        if (!cancelled) {
          const detail = reason instanceof Error ? reason.message : String(reason);
          setError(`工作区同步中断，正在重试；当前保留上次状态。${detail}`);
        }
      } finally {
        if (!cancelled) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [workspaceId, runId]);

  return { workspace, run, events, error, attach };
}
