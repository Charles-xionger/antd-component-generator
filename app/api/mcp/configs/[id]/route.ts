import { NextRequest } from "next/server";
import prisma from "@/lib/database/pirsma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await prisma.mCPConfig.findUnique({ where: { id } });
    if (!config) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ config });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();
    const config = await prisma.mCPConfig.update({ where: { id }, data });
    return Response.json({ config });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to update config" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.mCPConfig.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to delete config" }, { status: 500 });
  }
}
