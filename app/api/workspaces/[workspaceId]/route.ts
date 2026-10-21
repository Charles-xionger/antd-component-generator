import { workspaceApi } from "../server";

export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  return workspaceApi.getWorkspace((await params).workspaceId);
}
