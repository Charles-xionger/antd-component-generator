import { auth } from "@/lib/auth";
import { HomeClient } from "@/app/home-client";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  const { projectId } = await params;
  return <HomeClient user={session?.user || null} initialProjectId={projectId} />;
}
