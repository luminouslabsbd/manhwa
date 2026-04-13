import { getPodConfig, savePodConfig, type VideoQualityPreset } from "@/lib/pod-config";
import { verifyAdmin } from "@/lib/dal";

const VALID_PRESETS: VideoQualityPreset[] = ["fast", "balanced", "smooth"];

// GET /api/admin/pods/video-preset
export async function GET() {
  await verifyAdmin();
  const cfg = getPodConfig();
  return Response.json({ preset: cfg.videoQualityPreset ?? "balanced" });
}

// PATCH /api/admin/pods/video-preset
export async function PATCH(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));
  const { preset } = body as { preset?: string };
  if (!preset || !VALID_PRESETS.includes(preset as VideoQualityPreset)) {
    return Response.json({ error: "Invalid preset" }, { status: 400 });
  }
  const cfg = savePodConfig({ videoQualityPreset: preset as VideoQualityPreset });
  return Response.json({ ok: true, preset: cfg.videoQualityPreset });
}
