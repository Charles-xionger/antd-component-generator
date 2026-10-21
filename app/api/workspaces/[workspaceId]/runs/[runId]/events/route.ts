import { workspaceApi } from "../../../../server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string; runId: string }> }) {
  const { workspaceId, runId } = await params;
  return workspaceApi.getEvents(request, workspaceId, runId);
}
