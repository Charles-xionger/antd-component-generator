ALTER TABLE "platform"."AgentRun"
  ADD COLUMN "runtimeType" "platform"."RuntimeType" NOT NULL DEFAULT 'STATIC',
  ADD COLUMN "requirementSpec" JSONB,
  ADD COLUMN "appBlueprint" JSONB;
