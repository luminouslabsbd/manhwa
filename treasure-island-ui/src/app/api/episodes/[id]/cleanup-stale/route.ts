import { prisma } from "@/lib/prisma";

// Episode-scoped version of /api/admin/cleanup-stale.
// Sweeps orphan `status = "running"` generations for THIS episode's shots
// that are older than STALE_MS, marking them failed so regeneration is
// unblocked. This is the per-episode escape hatch the toolbar button uses.
const STALE_MS = 15 * 60 * 1000;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const shotIds = (await prisma.shot.findMany({
    where: { episode_id: id },
    select: { id: true },
  })).map((s) => s.id);

  if (!shotIds.length) {
    return Response.json({ ok: true, cleaned: 0, byType: {} });
  }

  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const stale = await prisma.generation.findMany({
    where: { shot_id: { in: shotIds }, status: "running", created_at: { lt: cutoff } },
    select: { id: true, type: true },
  });

  if (!stale.length) {
    return Response.json({ ok: true, cleaned: 0, byType: {} });
  }

  await prisma.generation.updateMany({
    where: { id: { in: stale.map((g) => g.id) } },
    data: {
      status: "failed",
      error: "timed out (pod likely restarted) — cleaned up from episode toolbar",
      completed_at: new Date().toISOString(),
    },
  });

  const byType: Record<string, number> = {};
  for (const g of stale) byType[g.type] = (byType[g.type] ?? 0) + 1;
  return Response.json({ ok: true, cleaned: stale.length, byType });
}
