import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { getSessionForApi } from "@/lib/dal";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const admin = await getSessionForApi();
  if (!admin || admin.role !== "SUPERADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (admin.impersonator) {
    return Response.json({ error: "Already impersonating" }, { status: 400 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ error: "Not found" }, { status: 404 });
  if (!target.is_active) return Response.json({ error: "User is disabled" }, { status: 400 });
  if (target.id === admin.userId) return Response.json({ error: "Cannot impersonate yourself" }, { status: 400 });

  await createSession({
    userId: target.id,
    email: target.email,
    name: target.name,
    role: target.role as "SUPERADMIN" | "USER",
    impersonator: { userId: admin.userId, name: admin.name, email: admin.email },
  });

  return Response.json({ ok: true });
}
