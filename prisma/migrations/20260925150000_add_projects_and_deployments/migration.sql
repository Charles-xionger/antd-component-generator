-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('BUILDING', 'ACTIVE', 'FAILED', 'SUPERSEDED', 'DISABLED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeDeploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- Expand existing tables before backfill.
ALTER TABLE "Thread" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ArtifactVersion" ADD COLUMN "generationRequestId" TEXT;

-- Every existing conversation becomes one project. Reusing the thread UUID makes
-- the migration deterministic while keeping the user-visible project name.
INSERT INTO "Project" ("id", "userId", "name", "slug", "createdAt", "updatedAt")
SELECT
  "id",
  "userId",
  "title",
  'project-' || substring(replace("id", '-', '') from 1 for 8),
  "createdAt",
  "updatedAt"
FROM "Thread";

UPDATE "Thread" SET "projectId" = "id";
UPDATE "Artifact" SET "projectId" = "threadId";

ALTER TABLE "Thread" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Artifact" ALTER COLUMN "projectId" SET NOT NULL;

-- Artifact is now owned by Project, not by the conversation.
ALTER TABLE "Artifact" DROP CONSTRAINT "Artifact_threadId_fkey";
DROP INDEX "Artifact_threadId_key";
ALTER TABLE "Artifact" DROP COLUMN "threadId";

-- Version numbers are unique within an artifact.
DROP INDEX "ArtifactVersion_artifactId_versionNumber_idx";
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_versionNumber_key" ON "ArtifactVersion"("artifactId", "versionNumber");
CREATE UNIQUE INDEX "ArtifactVersion_generationRequestId_key" ON "ArtifactVersion"("generationRequestId");

-- Project indexes and ownership relations.
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE UNIQUE INDEX "Project_activeDeploymentId_key" ON "Project"("activeDeploymentId");
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
CREATE INDEX "Project_status_updatedAt_idx" ON "Project"("status", "updatedAt");
CREATE UNIQUE INDEX "Thread_projectId_key" ON "Thread"("projectId");
CREATE INDEX "Thread_projectId_idx" ON "Thread"("projectId");
CREATE UNIQUE INDEX "Artifact_projectId_key" ON "Artifact"("projectId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deployment records point to immutable source versions.
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artifactVersionId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'BUILDING',
    "buildPath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Deployment_projectId_createdAt_idx" ON "Deployment"("projectId", "createdAt");
CREATE INDEX "Deployment_status_createdAt_idx" ON "Deployment"("status", "createdAt");
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_artifactVersionId_fkey" FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_activeDeploymentId_fkey" FOREIGN KEY ("activeDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
