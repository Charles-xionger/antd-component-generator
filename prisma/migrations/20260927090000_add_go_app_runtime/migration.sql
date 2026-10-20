CREATE TYPE "RuntimeType" AS ENUM ('STATIC', 'GO');
CREATE TYPE "BuildJobType" AS ENUM ('FULLSTACK_PREVIEW', 'PUBLISH', 'UNPUBLISH');
CREATE TYPE "BuildJobStatus" AS ENUM (
  'QUEUED', 'BUILDING', 'MIGRATING', 'TESTING', 'STARTING',
  'VERIFYING', 'SUCCEEDED', 'FAILED'
);

ALTER TABLE "ArtifactVersion"
  ADD COLUMN "requirementSpec" JSONB,
  ADD COLUMN "appBlueprint" JSONB,
  ADD COLUMN "runtimeManifest" JSONB,
  ADD COLUMN "runtimeVersion" TEXT,
  ADD COLUMN "fileManifest" JSONB;

ALTER TABLE "Deployment"
  ADD COLUMN "runtimeType" "RuntimeType" NOT NULL DEFAULT 'STATIC',
  ADD COLUMN "imageRef" TEXT,
  ADD COLUMN "migrationVersion" TEXT,
  ADD COLUMN "verification" JSONB,
  ADD COLUMN "endpoint" TEXT;

CREATE TABLE "BuildJob" (
  "id" TEXT NOT NULL,
  "type" "BuildJobType" NOT NULL,
  "status" "BuildJobStatus" NOT NULL DEFAULT 'QUEUED',
  "projectId" TEXT NOT NULL,
  "artifactVersionId" TEXT NOT NULL,
  "deploymentId" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "log" TEXT,
  "errorMessage" TEXT,
  "previewUrl" TEXT,
  "imageRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "BuildJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuildJob_leaseToken_key" ON "BuildJob"("leaseToken");
CREATE INDEX "BuildJob_status_createdAt_idx" ON "BuildJob"("status", "createdAt");
CREATE INDEX "BuildJob_projectId_createdAt_idx" ON "BuildJob"("projectId", "createdAt");
CREATE INDEX "BuildJob_artifactVersionId_type_status_idx" ON "BuildJob"("artifactVersionId", "type", "status");

ALTER TABLE "BuildJob" ADD CONSTRAINT "BuildJob_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildJob" ADD CONSTRAINT "BuildJob_artifactVersionId_fkey"
  FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildJob" ADD CONSTRAINT "BuildJob_deploymentId_fkey"
  FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The JSONB Data Gateway never reached production. Retire its control tables
-- after the Go runtime metadata is safely in place. Application data is now
-- stored in per-project relational PostgreSQL schemas managed by SQL migrations.
DROP TABLE IF EXISTS "DataRecordRevision" CASCADE;
DROP TABLE IF EXISTS "DataRecord" CASCADE;
DROP TABLE IF EXISTS "DataMigration" CASCADE;
DROP TABLE IF EXISTS "DataSchemaVersion" CASCADE;
DROP TABLE IF EXISTS "DataCollection" CASCADE;
DROP TYPE IF EXISTS "DataRecordOperation";
DROP TYPE IF EXISTS "DataMigrationStatus";
DROP TYPE IF EXISTS "DataSchemaStatus";
DROP TYPE IF EXISTS "DataEnvironment";
