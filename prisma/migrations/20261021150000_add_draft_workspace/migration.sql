CREATE TYPE "platform"."DraftWorkspaceStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "platform"."DraftWorkspace" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "baseArtifactVersionId" TEXT,
  "status" "platform"."DraftWorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."DraftFile" (
  "workspaceId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  CONSTRAINT "DraftFile_pkey" PRIMARY KEY ("workspaceId", "path")
);

CREATE TABLE "platform"."DraftFileRevision" (
  "workspaceId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "content" TEXT,
  "sha256" TEXT,
  CONSTRAINT "DraftFileRevision_pkey" PRIMARY KEY ("workspaceId", "path", "revision")
);

CREATE TABLE "platform"."DraftWriteReceipt" (
  "workspaceId" TEXT NOT NULL,
  "toolCallId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "path" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  CONSTRAINT "DraftWriteReceipt_pkey" PRIMARY KEY ("workspaceId", "toolCallId")
);


CREATE UNIQUE INDEX "DraftWorkspace_taskId_key" ON "platform"."DraftWorkspace"("taskId");
CREATE INDEX "DraftWorkspace_projectId_createdAt_idx" ON "platform"."DraftWorkspace"("projectId", "createdAt");
CREATE INDEX "DraftFileRevision_workspaceId_revision_idx" ON "platform"."DraftFileRevision"("workspaceId", "revision");

ALTER TABLE "platform"."DraftWorkspace" ADD CONSTRAINT "DraftWorkspace_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "platform"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."DraftWorkspace" ADD CONSTRAINT "DraftWorkspace_baseArtifactVersionId_fkey"
  FOREIGN KEY ("baseArtifactVersionId") REFERENCES "platform"."ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."DraftFile" ADD CONSTRAINT "DraftFile_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "platform"."DraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."DraftFileRevision" ADD CONSTRAINT "DraftFileRevision_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "platform"."DraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform"."DraftWriteReceipt" ADD CONSTRAINT "DraftWriteReceipt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "platform"."DraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
