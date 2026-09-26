import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { dataGatewayErrorResponse } from "@/lib/data-gateway/errors";
import { listDraftRecords } from "@/lib/data-gateway/service";

interface Context {
  params: Promise<{ projectId: string; collectionKey: string }>;
}

export async function GET(request: NextRequest, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { projectId, collectionKey } = await params;
    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const result = await listDraftRecords(
      projectId,
      session.user.id,
      collectionKey,
      query,
    );
    return Response.json(result);
  } catch (error) {
    return dataGatewayErrorResponse(error);
  }
}
