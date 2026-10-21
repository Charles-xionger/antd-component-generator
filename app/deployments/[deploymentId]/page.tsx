import { DeploymentStatusView } from "@/components/publishing/deployment-status-view";

export default async function DeploymentStatusPage({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const { deploymentId } = await params;
  return (
    <div className="h-screen overflow-hidden">
      <DeploymentStatusView deploymentId={deploymentId} />
    </div>
  );
}
