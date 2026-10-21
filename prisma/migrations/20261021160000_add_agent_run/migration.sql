CREATE TYPE "platform"."AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY_TO_VALIDATE', 'NEEDS_INPUT', 'NO_PROGRESS', 'CANCELLED', 'FAILED', 'COMMITTED');
CREATE TYPE "platform"."AgentStepStatus" AS ENUM ('DECIDED', 'COMPLETED');

CREATE TABLE "platform"."AgentRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "status" "platform"."AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "nextStep" INTEGER NOT NULL DEFAULT 0,
  "maxSteps" INTEGER NOT NULL DEFAULT 30,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."AgentRunStep" (
  "runId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "status" "platform"."AgentStepStatus" NOT NULL DEFAULT 'DECIDED',
  "decision" JSONB NOT NULL,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("runId", "number")
);

CREATE UNIQUE INDEX "AgentRun_requestId_key" ON "platform"."AgentRun"("requestId");
CREATE UNIQUE INDEX "AgentRun_leaseToken_key" ON "platform"."AgentRun"("leaseToken");
CREATE INDEX "AgentRun_workspaceId_createdAt_idx" ON "platform"."AgentRun"("workspaceId", "createdAt");
CREATE INDEX "AgentRun_status_leaseUntil_idx" ON "platform"."AgentRun"("status", "leaseUntil");
CREATE UNIQUE INDEX "AgentRun_one_active_per_workspace" ON "platform"."AgentRun"("workspaceId") WHERE "status" IN ('QUEUED', 'RUNNING');
ALTER TABLE "platform"."AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "platform"."DraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."AgentRunStep" ADD CONSTRAINT "AgentRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "platform"."AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
