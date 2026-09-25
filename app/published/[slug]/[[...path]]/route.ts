export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { readFile } from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/database/prisma";
import { deploymentStorage } from "@/lib/publishing/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function unavailable() {
  return new Response(
    "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>应用未上线</title><body style=\"font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f5f5\"><main><h1>应用暂未上线</h1><p>该项目尚未发布或已下线。</p></main></body></html>",
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; path?: string[] }> },
) {
  const { slug, path: segments } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return unavailable();

  const project = await prisma.project.findFirst({
    where: { slug, status: "ACTIVE", activeDeploymentId: { not: null } },
    include: { activeDeployment: true },
  });
  const buildPath = project?.activeDeployment?.buildPath;
  if (!buildPath || project?.activeDeployment?.status !== "ACTIVE") {
    return unavailable();
  }

  const requestedPath = segments?.length ? segments.join("/") : "index.html";
  let absolutePath: string;
  try {
    absolutePath = deploymentStorage.resolve(buildPath, requestedPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  try {
    const content = await readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    const immutable = /\.[a-f0-9]{12}\.(js|css)$/.test(requestedPath);
    return new Response(content, {
      headers: {
        "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
        "Cache-Control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
