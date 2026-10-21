CREATE SCHEMA IF NOT EXISTS "platform";

ALTER TYPE "ProjectStatus" SET SCHEMA "platform";
ALTER TYPE "DeploymentStatus" SET SCHEMA "platform";
ALTER TYPE "RuntimeType" SET SCHEMA "platform";
ALTER TYPE "BuildJobType" SET SCHEMA "platform";
ALTER TYPE "BuildJobStatus" SET SCHEMA "platform";

ALTER TABLE "User" SET SCHEMA "platform";
ALTER TABLE "Project" SET SCHEMA "platform";
ALTER TABLE "Account" SET SCHEMA "platform";
ALTER TABLE "Session" SET SCHEMA "platform";
ALTER TABLE "VerificationToken" SET SCHEMA "platform";
ALTER TABLE "Thread" SET SCHEMA "platform";
ALTER TABLE "Artifact" SET SCHEMA "platform";
ALTER TABLE "ArtifactVersion" SET SCHEMA "platform";
ALTER TABLE "Deployment" SET SCHEMA "platform";
ALTER TABLE "BuildJob" SET SCHEMA "platform";
ALTER TABLE "File" SET SCHEMA "platform";
ALTER TABLE "Share" SET SCHEMA "platform";
ALTER TABLE "MCPConfig" SET SCHEMA "platform";
