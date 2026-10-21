CREATE TABLE "platform"."DraftValidationRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "runtimeType" "platform"."RuntimeType" NOT NULL,
    "status" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "diagnostics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftValidationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftValidationRun_workspaceId_revision_createdAt_idx" ON "platform"."DraftValidationRun"("workspaceId", "revision", "createdAt");

ALTER TABLE "platform"."DraftValidationRun" ADD CONSTRAINT "DraftValidationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "platform"."DraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
