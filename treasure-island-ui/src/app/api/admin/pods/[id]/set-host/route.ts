import { getPodProxyUrls } from "@/lib/runpod";
import { getPodConfig, savePodConfig, type PodConfig, type PodService } from "@/lib/pod-config";
import { verifyAdmin } from "@/lib/dal";

const ALL_SERVICES: PodService[] = ["image", "video", "ollama", "tts"];

// POST /api/admin/pods/[id]/set-host
// Body: {
//   services?: "all" | ("image" | "video" | "ollama" | "tts")[],
//   action?:   "set" | "clear"   // defaults to "set"
// }
//
// `set`   → points the named services at this pod.
// `clear` → unsets those services *only if they currently point at this pod*.
//           Leaves them alone if another pod is still the assigned host (so
//           clearing "tts" from pod A can't accidentally blow away a TTS
//           assignment that's already moved to pod B).
//
// Image and Video both map to the ComfyUI proxy but have separate host
// slots so image and video generation can be routed to different pods.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;

  let services: PodService[] = [...ALL_SERVICES];
  let action: "set" | "clear" = "set";
  try {
    const body = (await req.json().catch(() => null)) as {
      services?: "all" | PodService[];
      action?: "set" | "clear";
    } | null;
    if (body?.action === "clear") action = "clear";
    if (body?.services && body.services !== "all") {
      services = body.services.filter((s): s is PodService => (ALL_SERVICES as string[]).includes(s));
      if (services.length === 0) {
        return Response.json({ error: "services[] must include at least one of image/video/ollama/tts" }, { status: 400 });
      }
    }
  } catch { /* default */ }

  const urls = getPodProxyUrls(id);
  const updates: Partial<PodConfig> = { lastActivityAt: new Date().toISOString() };

  if (action === "set") {
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
    // Legacy activePodId mirrors the "assign everything" case.
    if (services.length === ALL_SERVICES.length) updates.activePodId = id;
  } else {
    // Clear: only touch slots currently owned by THIS pod. Using undefined
    // (not null) because savePodConfig's Partial<> shape drops undefined
    // keys from the rewrite — we need to explicitly blank them instead.
    const cfg = getPodConfig();
    if (services.includes("image") && cfg.activeImagePodId === id) {
      updates.activeImagePodId = undefined;
      updates.comfyuiHost = undefined;
    }
    if (services.includes("video") && cfg.activeVideoPodId === id) {
      updates.activeVideoPodId = undefined;
      updates.videoHost = undefined;
    }
    if (services.includes("ollama") && cfg.activeOllamaPodId === id) {
      updates.activeOllamaPodId = undefined;
      updates.ollamaHost = undefined;
    }
    if (services.includes("tts") && cfg.activeTtsPodId === id) {
      updates.activeTtsPodId = undefined;
      updates.ttsHost = undefined;
    }
    if (cfg.activePodId === id) updates.activePodId = undefined;
  }

  const saved = savePodConfig(updates);
  return Response.json({
    ok: true,
    podId: id,
    services,
    action,
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
