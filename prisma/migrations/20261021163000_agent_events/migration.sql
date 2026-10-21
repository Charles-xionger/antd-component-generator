ALTER TABLE "platform"."AgentRun"
  ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN "turnId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN "nextEventSeq" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "platform"."AgentEvent" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "toolCallId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentEvent_runId_sequence_key" ON "platform"."AgentEvent"("runId", "sequence");
CREATE INDEX "AgentEvent_runId_createdAt_idx" ON "platform"."AgentEvent"("runId", "createdAt");
ALTER TABLE "platform"."AgentEvent" ADD CONSTRAINT "AgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "platform"."AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
