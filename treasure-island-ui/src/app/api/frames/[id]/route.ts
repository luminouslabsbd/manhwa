import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const frame = await prisma.frame.findUnique({ where: { id } });
  if (!frame) return Response.json({ error: "Not found" }, { status: 404 });

  const allowed = ["description", "prompt", "needed", "frame_number", "status", "image_path", "video_path"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }
  const updated = await prisma.frame.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.frame.delete({ where: { id } }).catch(() => {});
  return Response.json({ ok: true });
}
