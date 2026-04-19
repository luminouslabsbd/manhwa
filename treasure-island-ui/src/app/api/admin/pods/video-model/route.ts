import { getAppConfig, setAppConfig, type VideoModel } from "@/lib/app-config";
import { verifyAdmin } from "@/lib/dal";

const VALID_MODELS: VideoModel[] = ["wan2", "ltx2"];

// GET /api/admin/pods/video-model
export async function GET() {
  await verifyAdmin();
  const cfg = await getAppConfig();
  return Response.json({ model: cfg.video_model });
}

// PATCH /api/admin/pods/video-model
export async function PATCH(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));
  const { model } = body as { model?: string };
  if (!model || !VALID_MODELS.includes(model as VideoModel)) {
    return Response.json({ error: "Invalid model" }, { status: 400 });
  }
  const cfg = await setAppConfig({ video_model: model as VideoModel });
  return Response.json({ ok: true, model: cfg.video_model });
}
