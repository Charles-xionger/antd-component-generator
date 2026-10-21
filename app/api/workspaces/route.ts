import { workspaceApi } from "./server";

export async function POST(request: Request) {
  return workspaceApi.create(request);
}
