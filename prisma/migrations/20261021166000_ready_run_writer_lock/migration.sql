DROP INDEX "platform"."AgentRun_one_active_per_workspace";
CREATE UNIQUE INDEX "AgentRun_one_active_per_workspace" ON "platform"."AgentRun"("workspaceId") WHERE "status" IN ('QUEUED', 'RUNNING', 'READY_TO_VALIDATE');
