import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";

export async function GET() {
  try {
    const configs = await prisma.mCPConfig.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return Response.json({ configs });
  } catch (err) {
    console.error("Failed to fetch MCP configs:", err);
    return Response.json(
      { error: "Failed to fetch MCP configs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, url, description, enabled } = await request.json();
    if (!name || !url) {
      return Response.json(
        { error: "name and url are required" },
        { status: 400 }
      );
    }
    const config = await prisma.mCPConfig.create({
      data: { name, url, description, enabled: enabled ?? true },
    });
    return Response.json({ config });
  } catch (err) {
    console.error("Failed to create MCP config:", err);
    return Response.json(
      { error: "Failed to create MCP config" },
      { status: 500 }
    );
  }
}
