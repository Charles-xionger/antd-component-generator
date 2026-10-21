import { workspaceApi } from "../../../server";

export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string; runId: string }> }) {
  const { workspaceId, runId } = await params;
  return workspaceApi.getRun(workspaceId, runId);
}
