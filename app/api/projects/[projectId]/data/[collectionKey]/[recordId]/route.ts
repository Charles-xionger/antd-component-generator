import { auth } from "@/lib/auth";
import { dataGatewayErrorResponse } from "@/lib/data-gateway/errors";
import { getDraftRecord } from "@/lib/data-gateway/service";

interface Context {
  params: Promise<{
    projectId: string;
    collectionKey: string;
    recordId: string;
  }>;
}

export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { projectId, collectionKey, recordId } = await params;
    const result = await getDraftRecord(
      projectId,
      session.user.id,
      collectionKey,
      recordId,
    );
    return Response.json(result);
  } catch (error) {
    return dataGatewayErrorResponse(error);
  }
}
