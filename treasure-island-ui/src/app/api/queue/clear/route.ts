import { prisma } from "@/lib/prisma";
import { getHost } from "@/lib/comfyui";

export async function POST() {
  const results: Record<string, unknown> = {};

  // 1 — Clear BullMQ queue (all waiting jobs)
  try {
    const { Queue } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    const conn = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
    const q = new Queue("generation", { connection: conn });
    const obliterated = await q.obliterate({ force: true });
    await conn.quit();
    results.bullmq = `cleared (${obliterated ?? "all"} jobs removed)`;
  } catch (e) {
    results.bullmq = `error: ${String(e)}`;
  }

  // 2 — Tell ComfyUI to interrupt current job + clear its queue
  const host = getHost();
  try {
    await fetch(`${host}/interrupt`, { method: "POST", signal: AbortSignal.timeout(5000) });
    results.comfyui_interrupt = "ok";
  } catch (e) {
    results.comfyui_interrupt = `error: ${String(e)}`;
  }

  try {
    await fetch(`${host}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
      signal: AbortSignal.timeout(5000),
    });
    results.comfyui_queue = "cleared";
  } catch (e) {
    results.comfyui_queue = `error: ${String(e)}`;
  }

  // 3 — Reset all "generating" shots back to "draft" in DB
  const reset = await prisma.shot.updateMany({
    where: { status: "generating" },
    data: { status: "draft" },
  });
  results.shots_reset = reset.count;

  // 4 — Mark all running generations as cancelled
  const cancelled = await prisma.generation.updateMany({
    where: { status: "running" },
    data: { status: "cancelled", completed_at: new Date().toISOString() },
  });
  results.generations_cancelled = cancelled.count;

  return Response.json({ ok: true, ...results });
}
