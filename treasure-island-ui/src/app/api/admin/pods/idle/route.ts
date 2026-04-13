import { getPodConfig, savePodConfig } from "@/lib/pod-config";
import { verifyAdmin } from "@/lib/dal";

// GET /api/admin/pods/idle — return idle config + status
export async function GET() {
  await verifyAdmin();
  const cfg = getPodConfig();
  return Response.json({
    enabled: cfg.idleStopEnabled,
    minutes: cfg.idleStopMinutes,
    lastActivityAt: cfg.lastActivityAt ?? null,
    lastIdleCheckAt: cfg.lastIdleCheckAt ?? null,
    activePodId: cfg.activePodId ?? null,
  });
}

// PATCH /api/admin/pods/idle — update idle config
export async function PATCH(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));
  const { enabled, minutes } = body as { enabled?: boolean; minutes?: number };
  const updates: Record<string, unknown> = {};
  if (typeof enabled === "boolean") updates.idleStopEnabled = enabled;
  if (typeof minutes === "number" && minutes > 0) updates.idleStopMinutes = minutes;
  const cfg = savePodConfig(updates);
  return Response.json({ ok: true, enabled: cfg.idleStopEnabled, minutes: cfg.idleStopMinutes });
}
