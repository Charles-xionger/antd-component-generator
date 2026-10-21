import assert from "node:assert/strict";
import test from "node:test";

import { appendPublicationActivity } from "./deployment-events";
import { createDeploymentStatusService } from "./deployment-status";

test("returns an owned asynchronous deployment as a safe publication snapshot", async () => {
  const activity = appendPublicationActivity(null, {
    timestamp: "2026-10-21T09:00:00.000Z",
    stage: "building",
    level: "info",
    message: "building with DATABASE_URL=postgresql://root:secret@db/app",
  });
  const service = createDeploymentStatusService({
    async findOwnedDeployment(deploymentId, userId) {
      assert.equal(deploymentId, "deployment-1");
      assert.equal(userId, "user-1");
      return {
        id: "deployment-1",
        projectId: "project-1",
        status: "BUILDING",
        runtimeType: "GO",
        endpoint: null,
        errorMessage: null,
        createdAt: new Date("2026-10-21T08:59:59.000Z"),
        activatedAt: null,
        artifactVersion: { versionNumber: 7 },
        project: {
          name: "Customer portal",
          slug: "customer-portal",
          activeDeploymentId: "deployment-old",
        },
        buildJobs: [{
          id: "job-1",
          status: "BUILDING",
          log: activity.log,
          errorMessage: null,
          startedAt: new Date("2026-10-21T09:00:00.000Z"),
          completedAt: null,
        }],
      };
    },
  }, { publishedHostname: (slug) => `${slug}.apps.example.com` });

  const snapshot = await service.getOwnedSnapshot("deployment-1", "user-1");

  assert.deepEqual(snapshot, {
    deploymentId: "deployment-1",
    projectId: "project-1",
    projectName: "Customer portal",
    versionNumber: 7,
    runtimeType: "GO",
    state: "running",
    progress: {
      stage: "building",
      stageLabel: "构建",
      progress: 20,
      title: "正在构建应用",
      detail: "正在生成可发布的应用版本",
      outcome: "running",
    },
    publishedUrl: "https://customer-portal.apps.example.com",
    endpoint: null,
    previousVersionAvailable: true,
    jobId: "job-1",
    activities: [{
      jobId: "job-1",
      ...activity.event,
      message: "building with DATABASE_URL=[REDACTED]",
    }],
    lastSequence: 1,
    createdAt: "2026-10-21T08:59:59.000Z",
    startedAt: "2026-10-21T09:00:00.000Z",
    completedAt: null,
    error: null,
    terminal: false,
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /secret/);
});

test("represents a synchronous static deployment as complete without invented activities", async () => {
  const service = createDeploymentStatusService({
    async findOwnedDeployment() {
      return {
        id: "deployment-static",
        projectId: "project-2",
        status: "ACTIVE",
        runtimeType: "STATIC",
        endpoint: null,
        errorMessage: null,
        createdAt: new Date("2026-10-21T10:00:00.000Z"),
        activatedAt: new Date("2026-10-21T10:00:01.000Z"),
        artifactVersion: { versionNumber: 4 },
        project: {
          name: "Landing page",
          slug: "landing-page",
          activeDeploymentId: "deployment-static",
        },
        buildJobs: [],
      };
    },
  }, { publishedHostname: (slug) => `${slug}.example.test` });

  const snapshot = await service.getOwnedSnapshot("deployment-static", "user-2");

  assert.equal(snapshot?.state, "success");
  assert.equal(snapshot?.terminal, true);
  assert.equal(snapshot?.jobId, null);
  assert.deepEqual(snapshot?.activities, []);
  assert.equal(snapshot?.lastSequence, 0);
  assert.equal(snapshot?.completedAt, "2026-10-21T10:00:01.000Z");
});

test("reports the actual failed stage and deterministic recovery guidance", async () => {
  const activity = appendPublicationActivity(null, {
    timestamp: "2026-10-21T11:00:00.000Z",
    stage: "uploading",
    level: "error",
    message: "migration failed",
  });
  const service = createDeploymentStatusService({
    async findOwnedDeployment() {
      return {
        id: "deployment-failed",
        projectId: "project-3",
        status: "FAILED",
        runtimeType: "GO",
        endpoint: null,
        errorMessage: "migration failed: PASSWORD=do-not-leak",
        createdAt: new Date("2026-10-21T10:59:00.000Z"),
        activatedAt: null,
        artifactVersion: { versionNumber: 8 },
        project: { name: "CRM", slug: "crm", activeDeploymentId: "deployment-old" },
        buildJobs: [{
          id: "job-failed",
          status: "FAILED",
          log: activity.log,
          errorMessage: "migration failed: PASSWORD=do-not-leak",
          startedAt: new Date("2026-10-21T10:59:01.000Z"),
          completedAt: new Date("2026-10-21T11:00:01.000Z"),
        }],
      };
    },
  }, { publishedHostname: (slug) => `${slug}.example.test` });

  const snapshot = await service.getOwnedSnapshot("deployment-failed", "user-3");

  assert.equal(snapshot?.state, "failed");
  assert.equal(snapshot?.previousVersionAvailable, true);
  assert.equal(snapshot?.error?.stage, "uploading");
  assert.equal(snapshot?.error?.stageLabel, "上传");
  assert.equal(snapshot?.error?.code, "data_preparation_failed");
  assert.doesNotMatch(JSON.stringify(snapshot), /do-not-leak/);
});
