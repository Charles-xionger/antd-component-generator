import { auth } from "@/lib/auth";
import { createWorkspaceApi } from "./handlers";

export const workspaceApi = createWorkspaceApi({
  async authenticate() {
    const session = await auth();
    return session?.user?.id ?? null;
  },
});
