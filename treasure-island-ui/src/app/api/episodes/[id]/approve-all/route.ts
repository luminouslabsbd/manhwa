import { prisma } from "@/lib/prisma";

/** Approve the latest completed image generation for all "done" shots in this episode */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const shots = await prisma.shot.findMany({ where: { episode_id: id, status: "done" } });
  if (!shots.length) return Response.json({ ok: true, approved: 0, total: 0 });

  const shotIds = shots.map(s => s.id);
  const gens = await prisma.generation.findMany({
    where: {
      shot_id: { in: shotIds },
      type: { startsWith: "image" },
      status: "completed",
    },
    orderBy: { completed_at: "desc" },
  });

  let approved = 0;
  for (const shot of shots) {
    const gen = gens.find(g => g.shot_id === shot.id);
    if (gen) {
      // Single-select: each shot's approval is the latest completed image only.
      await prisma.shot.update({
        where: { id: shot.id },
        data: {
          approved_image_id: gen.id,
          approved_image_ids: [gen.id],
          status: "approved",
        },
      });
      approved++;
    }
  }

  return Response.json({ ok: true, approved, total: shots.length });
}
