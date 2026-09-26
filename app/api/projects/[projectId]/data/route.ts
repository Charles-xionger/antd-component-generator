import { auth } from "@/lib/auth";
import { dataGatewayErrorResponse } from "@/lib/data-gateway/errors";
import { listDraftCollections } from "@/lib/data-gateway/service";

interface Context {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const collections = await listDraftCollections(projectId, session.user.id);
    return Response.json({ collections });
  } catch (error) {
    return dataGatewayErrorResponse(error);
  }
}
