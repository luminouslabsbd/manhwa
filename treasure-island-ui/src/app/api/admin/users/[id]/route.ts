import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  const { password: _p, ...safe } = user;
  return Response.json(safe);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  if (user.role === "SUPERADMIN") return Response.json({ error: "Cannot modify super admin" }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.role === "USER" || body.role === "SUPERADMIN") updates.role = body.role;
  if (body.password && body.password.length >= 8) updates.password = await hashPassword(body.password);

  const updated = await prisma.user.update({ where: { id }, data: updates });
  const { password: _p, ...safe } = updated;
  return Response.json(safe);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  if (user.role === "SUPERADMIN") return Response.json({ error: "Cannot delete super admin" }, { status: 403 });

  // Unassign their projects instead of cascade deleting
  await prisma.project.updateMany({ where: { user_id: id }, data: { user_id: null } });
  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
