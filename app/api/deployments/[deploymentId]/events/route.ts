import { type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { createDeploymentEventsHandler } from "@/lib/publishing/deployment-stream";
import { deploymentStatusService } from "@/lib/publishing/deployment-status-prisma";

export const dynamic = "force-dynamic";

const handleEvents = createDeploymentEventsHandler({
  async authenticate() {
    const session = await auth();
    return session?.user?.id || null;
  },
  loadSnapshot(deploymentId, userId) {
    return deploymentStatusService.getOwnedSnapshot(deploymentId, userId);
  },
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const { deploymentId } = await params;
  return handleEvents(request, deploymentId);
}
