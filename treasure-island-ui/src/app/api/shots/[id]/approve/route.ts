import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { generation_id } = await req.json();

  const gen = await prisma.generation.findFirst({ where: { id: generation_id, shot_id: id } });
  if (!gen) return Response.json({ error: "Generation not found" }, { status: 404 });

  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  if (gen.type === "tts") {
    const newTts = shot.approved_tts_id === generation_id ? null : generation_id;
    await prisma.shot.update({ where: { id }, data: { approved_tts_id: newTts } });
    return Response.json({ ok: true });

  } else if (gen.type === "video") {
    await prisma.shot.update({ where: { id }, data: { approved_video_id: generation_id, status: "video_done" } });
    return Response.json({ ok: true });

  } else {
    // Image: toggle in approved_image_ids array
    const current: string[] = shot.approved_image_ids ?? [];
    const idx = current.indexOf(generation_id);
    const next = idx === -1
      ? [...current, generation_id]
      : current.filter((_, i) => i !== idx);

    const newApprovedId = next[next.length - 1] ?? null;
    const newStatus = next.length > 0 ? "approved" : "done";

    await prisma.shot.update({
      where: { id },
      data: {
        approved_image_ids: next,
        approved_image_id: newApprovedId,
        status: newStatus,
      },
    });

    return Response.json({ ok: true, approved_image_ids: next });
  }
}
