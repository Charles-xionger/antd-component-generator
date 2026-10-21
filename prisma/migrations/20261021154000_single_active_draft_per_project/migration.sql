CREATE UNIQUE INDEX "DraftWorkspace_one_active_per_project_idx"
  ON "platform"."DraftWorkspace"("projectId")
  WHERE "status" = 'ACTIVE';
