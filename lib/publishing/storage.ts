import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

export interface StorageAdapter {
  createTemporaryPath(projectId: string, deploymentId: string): Promise<string>;
  commit(projectId: string, deploymentId: string, temporaryPath: string): Promise<string>;
  cleanup(temporaryPath: string): Promise<void>;
  resolve(buildPath: string, filePath: string): string;
}

export class LocalVolumeAdapter implements StorageAdapter {
  private readonly root = path.resolve(
    process.env.DEPLOYMENTS_ROOT || "/deployments",
  );

  async createTemporaryPath(projectId: string, deploymentId: string) {
    const temporaryPath = path.join(
      this.root,
      ".tmp",
      `${projectId}-${deploymentId}`,
    );
    await rm(temporaryPath, { recursive: true, force: true });
    await mkdir(temporaryPath, { recursive: true });
    return temporaryPath;
  }

  async commit(projectId: string, deploymentId: string, temporaryPath: string) {
    const relativePath = path.join(projectId, deploymentId);
    const finalPath = path.join(this.root, relativePath);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rm(finalPath, { recursive: true, force: true });
    await rename(temporaryPath, finalPath);
    return relativePath;
  }

  async cleanup(temporaryPath: string) {
    await rm(temporaryPath, { recursive: true, force: true });
  }

  resolve(buildPath: string, filePath: string) {
    const buildRoot = path.resolve(this.root, buildPath);
    const resolved = path.resolve(buildRoot, filePath);
    if (resolved !== buildRoot && !resolved.startsWith(`${buildRoot}${path.sep}`)) {
      throw new Error("Invalid deployment path");
    }
    return resolved;
  }
}

export const deploymentStorage = new LocalVolumeAdapter();
