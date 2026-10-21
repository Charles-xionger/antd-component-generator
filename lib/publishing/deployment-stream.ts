import type { DeploymentStatusSnapshot } from "./deployment-status";

interface DeploymentEventsDependencies {
  authenticate(): Promise<string | null>;
  loadSnapshot(deploymentId: string, userId: string): Promise<DeploymentStatusSnapshot | null>;
  pollIntervalMs?: number;
}

function encodeSse(event: string, data: unknown, id?: number) {
  return `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function statusPayload(snapshot: DeploymentStatusSnapshot) {
  return {
    state: snapshot.state,
    progress: snapshot.progress,
    previousVersionAvailable: snapshot.previousVersionAvailable,
    error: snapshot.error,
    completedAt: snapshot.completedAt,
  };
}

export function createDeploymentEventsHandler(dependencies: DeploymentEventsDependencies) {
  return async function handleDeploymentEvents(
    request: Request,
    deploymentId: string,
  ): Promise<Response> {
    const userId = await dependencies.authenticate();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const snapshot = await dependencies.loadSnapshot(deploymentId, userId);
    if (!snapshot) {
      return Response.json({ error: "Deployment not found" }, { status: 404 });
    }
    const url = new URL(request.url);
    const cursorValue = request.headers.get("last-event-id") || url.searchParams.get("after") || "0";
    const parsedCursor = Number.parseInt(cursorValue, 10);
    const isResume = Number.isSafeInteger(parsedCursor) && parsedCursor > 0;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (event: string, data: unknown, id?: number) => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(encodeSse(event, data, id)));
            return true;
          } catch {
            // The browser may cancel the response before request.signal observes
            // the disconnect. Treat that as a normal stream shutdown.
            closed = true;
            return false;
          }
        };
        const sendComment = (comment: string) => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(`: ${comment}\n\n`));
            return true;
          } catch {
            closed = true;
            return false;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // A cancelled response is already closed by the runtime.
          }
        };
        const finish = (current: DeploymentStatusSnapshot) => {
          if (current.state === "failed") send("error", current.error || {
            code: "unknown",
            title: "发布未完成",
          });
          send("complete", {
            state: current.state,
            lastSequence: current.lastSequence,
          });
          close();
        };
        let cursor = isResume ? parsedCursor : snapshot.lastSequence;
        let previousStatus = JSON.stringify(statusPayload(snapshot));

        if (isResume) {
          for (const activity of snapshot.activities.filter((event) => event.sequence > cursor)) {
            send("activity", activity, activity.sequence);
            cursor = activity.sequence;
          }
          send("status", statusPayload(snapshot));
        } else {
          send("snapshot", snapshot);
        }
        if (snapshot.terminal) {
          finish(snapshot);
          return;
        }

        const poll = async () => {
          let heartbeat = 0;
          while (!request.signal.aborted) {
            await new Promise((resolve) => setTimeout(resolve, dependencies.pollIntervalMs ?? 1_000));
            if (request.signal.aborted) break;
            const current = await dependencies.loadSnapshot(deploymentId, userId);
            if (!current) {
              send("error", { code: "not_found", title: "发布任务不可用" });
              close();
              return;
            }
            for (const activity of current.activities.filter((event) => event.sequence > cursor)) {
              send("activity", activity, activity.sequence);
              cursor = activity.sequence;
            }
            const currentStatus = JSON.stringify(statusPayload(current));
            if (currentStatus !== previousStatus) {
              send("status", statusPayload(current));
              previousStatus = currentStatus;
            }
            if (current.terminal) {
              finish(current);
              return;
            }
            heartbeat += 1;
            if (heartbeat % 15 === 0 && !sendComment("heartbeat")) return;
          }
          close();
        };
        void poll().catch((error) => {
          if (request.signal.aborted || closed) {
            close();
            return;
          }
          send("error", {
            code: "stream_failed",
            title: "实时连接暂时中断",
            retryable: true,
          });
          void error;
          close();
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
