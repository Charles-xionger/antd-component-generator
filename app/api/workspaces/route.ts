import { workspaceApi } from "./server";

export async function GET(request: Request) {
  return workspaceApi.list(request);
}

export async function POST(request: Request) {
  return workspaceApi.create(request);
}
