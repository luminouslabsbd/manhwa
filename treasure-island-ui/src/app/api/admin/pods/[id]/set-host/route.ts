import { getPodProxyUrls } from "@/lib/runpod";
import { savePodConfig, type PodConfig, type PodService } from "@/lib/pod-config";
import { verifyAdmin } from "@/lib/dal";

const ALL_SERVICES: PodService[] = ["image", "video", "ollama", "tts"];

// POST /api/admin/pods/[id]/set-host
// Body: { services?: "all" | ("image" | "video" | "ollama" | "tts")[] }
// Defaults to "all" — sets this pod as host for every service.
// Image and Video both map to the ComfyUI proxy on the pod but are stored in
// separate host slots so the user can route image generation and video
// generation to different pods.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;

  let services: PodService[] = [...ALL_SERVICES];
  try {
    const body = (await req.json().catch(() => null)) as { services?: "all" | PodService[] } | null;
    if (body?.services && body.services !== "all") {
      services = body.services.filter((s): s is PodService => (ALL_SERVICES as string[]).includes(s));
      if (services.length === 0) {
        return Response.json({ error: "services[] must include at least one of image/video/ollama/tts" }, { status: 400 });
      }
    }
  } catch { /* default */ }

  const urls = getPodProxyUrls(id);
  const updates: Partial<PodConfig> = { lastActivityAt: new Date().toISOString() };
  if (services.includes("image")) {
    updates.comfyuiHost = urls.comfyui;
    updates.activeImagePodId = id;
  }
  if (services.includes("video")) {
    updates.videoHost = urls.comfyui;
    updates.activeVideoPodId = id;
  }
  if (services.includes("ollama")) {
    updates.ollamaHost = urls.ollama;
    updates.activeOllamaPodId = id;
  }
  if (services.includes("tts")) {
    updates.ttsHost = urls.tts;
    updates.activeTtsPodId = id;
  }
  // Keep legacy activePodId in sync: all four services on one pod → it's primary.
  if (services.length === ALL_SERVICES.length) updates.activePodId = id;

  const saved = savePodConfig(updates);
  return Response.json({
    ok: true,
    podId: id,
    services,
    comfyui: saved.comfyuiHost,
    video: saved.videoHost,
    ollama: saved.ollamaHost,
    tts: saved.ttsHost,
    activeImagePodId: saved.activeImagePodId,
    activeVideoPodId: saved.activeVideoPodId,
    activeOllamaPodId: saved.activeOllamaPodId,
    activeTtsPodId: saved.activeTtsPodId,
    activePodId: saved.activePodId,
  });
}
