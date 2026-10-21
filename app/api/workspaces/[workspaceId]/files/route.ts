import { workspaceApi } from "../../server";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  return workspaceApi.getFiles(request, (await params).workspaceId);
}
