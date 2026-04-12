import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body.is_default) {
    const existing = await prisma.promptTemplate.findUnique({ where: { id } });
    if (existing) {
      await prisma.promptTemplate.updateMany({ where: { project_id: existing.project_id }, data: { is_default: false } });
    }
  }
  const tmpl = await prisma.promptTemplate.update({ where: { id }, data: body });
  return Response.json(tmpl);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.promptTemplate.delete({ where: { id } });
  return Response.json({ ok: true });
}
