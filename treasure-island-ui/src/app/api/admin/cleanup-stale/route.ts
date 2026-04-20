import { prisma } from "@/lib/prisma";

// Mark every `status = "running"` generation older than STALE_MS as failed.
// Orphans accumulate when a pod dies mid-generation — the comfyui_prompt_id
// only exists on the dead pod, so the poller never reconciles them. They
// then block regeneration via the `alreadyRunning` check.
const STALE_MS = 15 * 60 * 1000;

export async function POST() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const stale = await prisma.generation.findMany({
    where: { status: "running", created_at: { lt: cutoff } },
    select: { id: true, type: true },
  });

  if (!stale.length) {
    return Response.json({ ok: true, cleaned: 0, byType: {} });
  }

  const ids = stale.map((g) => g.id);
  await prisma.generation.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "failed",
      error: "timed out (pod likely restarted) — cleaned up by admin sweep",
      completed_at: new Date().toISOString(),
    },
  });

  const byType: Record<string, number> = {};
  for (const g of stale) byType[g.type] = (byType[g.type] ?? 0) + 1;
  return Response.json({ ok: true, cleaned: stale.length, byType });
}
