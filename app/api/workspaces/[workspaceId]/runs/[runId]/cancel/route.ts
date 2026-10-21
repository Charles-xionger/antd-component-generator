import { workspaceApi } from "../../../../server";

export async function POST(_request: Request, { params }: { params: Promise<{ workspaceId: string; runId: string }> }) {
  const { workspaceId, runId } = await params;
  return workspaceApi.cancel(workspaceId, runId);
}
