import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loc = await prisma.location.findUnique({ where: { id } });
  if (!loc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(loc);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const loc = await prisma.location.findUnique({ where: { id } });
  if (!loc) return Response.json({ error: "Not found" }, { status: 404 });
  const allowed = ["name", "description", "reference_image"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }
  const updated = await prisma.location.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Unlink any shots pointing at this location so we don't leave dangling FKs
  await prisma.shot.updateMany({ where: { location_id: id }, data: { location_id: null } });
  await prisma.location.delete({ where: { id } });
  return Response.json({ ok: true });
}
