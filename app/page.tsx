import { auth } from "@/lib/auth";
import { HomeClient } from "./home-client";
import prisma from "@/lib/database/prisma";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await auth();
  const { thread } = await searchParams;

  if (thread && session?.user?.id) {
    const legacyThread = await prisma.thread.findFirst({
      where: { id: thread, userId: session.user.id },
      select: { projectId: true },
    });
    if (legacyThread) redirect(`/projects/${legacyThread.projectId}`);
  }

  return <HomeClient user={session?.user || null} />;
}
