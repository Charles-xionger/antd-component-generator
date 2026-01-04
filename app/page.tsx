import { auth } from "@/lib/auth";
import { HomeClient } from "./home-client";

export default async function Home() {
  const session = await auth();

  return <HomeClient user={session?.user || null} />;
}
