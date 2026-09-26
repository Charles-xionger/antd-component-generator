-- Data Gateway foundation is an expand-only migration. Existing V1 tables and
-- generated applications remain untouched.

-- CreateEnum
CREATE TYPE "DataEnvironment" AS ENUM ('DRAFT', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "DataSchemaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DataMigrationStatus" AS ENUM ('PENDING', 'APPLYING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DataRecordOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateTable
CREATE TABLE "DataCollection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeDraftSchemaId" TEXT,
    "activeProductionSchemaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSchemaVersion" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "status" "DataSchemaStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "DataSchemaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "environment" "DataEnvironment" NOT NULL,
    "data" JSONB NOT NULL,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DataRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRecordRevision" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" "DataRecordOperation" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataRecordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataMigration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "fromSchemaVersionIds" JSONB NOT NULL,
    "toSchemaVersionIds" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "DataMigrationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DataMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataCollection_activeDraftSchemaId_key" ON "DataCollection"("activeDraftSchemaId");
CREATE UNIQUE INDEX "DataCollection_activeProductionSchemaId_key" ON "DataCollection"("activeProductionSchemaId");
CREATE UNIQUE INDEX "DataCollection_projectId_key_key" ON "DataCollection"("projectId", "key");
CREATE INDEX "DataCollection_projectId_updatedAt_idx" ON "DataCollection"("projectId", "updatedAt");

CREATE UNIQUE INDEX "DataSchemaVersion_collectionId_versionNumber_key" ON "DataSchemaVersion"("collectionId", "versionNumber");
CREATE INDEX "DataSchemaVersion_collectionId_status_createdAt_idx" ON "DataSchemaVersion"("collectionId", "status", "createdAt");

CREATE INDEX "DataRecord_projectId_collectionId_environment_deletedAt_createdAt_idx" ON "DataRecord"("projectId", "collectionId", "environment", "deletedAt", "createdAt");
CREATE INDEX "DataRecord_projectId_collectionId_environment_updatedAt_idx" ON "DataRecord"("projectId", "collectionId", "environment", "updatedAt");

CREATE INDEX "DataRecordRevision_recordId_createdAt_idx" ON "DataRecordRevision"("recordId", "createdAt");
CREATE INDEX "DataRecordRevision_actorId_createdAt_idx" ON "DataRecordRevision"("actorId", "createdAt");

CREATE INDEX "DataMigration_projectId_createdAt_idx" ON "DataMigration"("projectId", "createdAt");
CREATE INDEX "DataMigration_deploymentId_idx" ON "DataMigration"("deploymentId");
CREATE INDEX "DataMigration_status_createdAt_idx" ON "DataMigration"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DataCollection" ADD CONSTRAINT "DataCollection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataSchemaVersion" ADD CONSTRAINT "DataSchemaVersion_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "DataCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataCollection" ADD CONSTRAINT "DataCollection_activeDraftSchemaId_fkey" FOREIGN KEY ("activeDraftSchemaId") REFERENCES "DataSchemaVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataCollection" ADD CONSTRAINT "DataCollection_activeProductionSchemaId_fkey" FOREIGN KEY ("activeProductionSchemaId") REFERENCES "DataSchemaVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataRecord" ADD CONSTRAINT "DataRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRecord" ADD CONSTRAINT "DataRecord_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "DataCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRecord" ADD CONSTRAINT "DataRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataRecord" ADD CONSTRAINT "DataRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataRecordRevision" ADD CONSTRAINT "DataRecordRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DataRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRecordRevision" ADD CONSTRAINT "DataRecordRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataMigration" ADD CONSTRAINT "DataMigration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataMigration" ADD CONSTRAINT "DataMigration_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

