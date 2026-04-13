import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { to_user_id } = await req.json();

  if (!to_user_id) {
    return Response.json({ error: "to_user_id is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const targetUser = await prisma.user.findUnique({ where: { id: to_user_id } });
  if (!targetUser) return Response.json({ error: "Target user not found" }, { status: 404 });

  const updated = await prisma.project.update({
    where: { id },
    data: { user_id: to_user_id },
  });

  return Response.json(updated);
}
