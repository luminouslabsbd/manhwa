import { getPodConfig, savePodConfig } from "@/lib/pod-config";
import { stopPod } from "@/lib/runpod";
import { getQueue } from "@/lib/comfyui";

// POST /api/admin/pods/idle/check
// Called by idle-monitor.sh every few minutes.
// Checks ComfyUI queue; if idle longer than threshold → stops the active pod.
export async function POST() {
  const cfg = getPodConfig();
  const now = new Date();

  if (!cfg.activePodId) {
    return Response.json({ ok: true, action: "none", reason: "no active pod" });
  }
  if (!cfg.idleStopEnabled) {
    return Response.json({ ok: true, action: "none", reason: "idle stop disabled" });
  }

  // Check ComfyUI queue
  const comfyuiHost = cfg.comfyuiHost ?? process.env.COMFYUI_HOST ?? "";
  let hasJobs = false;
  try {
    if (comfyuiHost) {
      const q = await getQueue(comfyuiHost);
      const running = q.queue_running?.length ?? 0;
      const pending = q.queue_pending?.length ?? 0;
      hasJobs = running + pending > 0;
    }
  } catch {
    // ComfyUI unreachable → treat as idle
  }

  if (hasJobs) {
    savePodConfig({ lastActivityAt: now.toISOString(), lastIdleCheckAt: now.toISOString() });
    return Response.json({ ok: true, action: "none", reason: "active jobs in queue" });
  }

  savePodConfig({ lastIdleCheckAt: now.toISOString() });

  // Calculate idle duration
  const lastActive = cfg.lastActivityAt ? new Date(cfg.lastActivityAt) : new Date(0);
  const idleMs = now.getTime() - lastActive.getTime();
  const idleMinutes = Math.floor(idleMs / 60_000);

  if (idleMinutes < cfg.idleStopMinutes) {
    return Response.json({
      ok: true,
      action: "none",
      idleMinutes,
      threshold: cfg.idleStopMinutes,
      remainingMinutes: cfg.idleStopMinutes - idleMinutes,
    });
  }

  // Idle threshold exceeded → stop pod
  try {
    await stopPod(cfg.activePodId);
    return Response.json({
      ok: true,
      action: "stopped",
      podId: cfg.activePodId,
      idleMinutes,
      stoppedAt: now.toISOString(),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// GET — manual check without stopping (just returns idle status)
export async function GET() {
  const cfg = getPodConfig();
  const now = new Date();
  const lastActive = cfg.lastActivityAt ? new Date(cfg.lastActivityAt) : null;
  const idleMs = lastActive ? now.getTime() - lastActive.getTime() : null;
  const idleMinutes = idleMs !== null ? Math.floor(idleMs / 60_000) : null;

  return Response.json({
    activePodId: cfg.activePodId ?? null,
    idleStopEnabled: cfg.idleStopEnabled,
    idleStopMinutes: cfg.idleStopMinutes,
    lastActivityAt: cfg.lastActivityAt ?? null,
    lastIdleCheckAt: cfg.lastIdleCheckAt ?? null,
    idleMinutes,
    wouldStop: idleMinutes !== null && idleMinutes >= cfg.idleStopMinutes,
  });
}
