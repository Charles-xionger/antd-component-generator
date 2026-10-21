CREATE TABLE "platform"."DraftFileChange" (
  "workspaceId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "toolCallId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "beforeSha256" TEXT,
  "afterSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftFileChange_pkey" PRIMARY KEY ("workspaceId", "revision")
);

CREATE UNIQUE INDEX "DraftFileChange_workspaceId_toolCallId_key" ON "platform"."DraftFileChange"("workspaceId", "toolCallId");

ALTER TABLE "platform"."DraftFileChange" ADD CONSTRAINT "DraftFileChange_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "platform"."DraftWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
