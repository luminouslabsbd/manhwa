import { getPodProxyUrls } from "@/lib/runpod";
import { savePodConfig } from "@/lib/pod-config";
import { verifyAdmin } from "@/lib/dal";

// POST /api/admin/pods/[id]/set-host
// Sets this pod as the active ComfyUI / Ollama / TTS host.
// Writes to .pod-config.json — read by resolveComfyUIHost() et al.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  const urls = getPodProxyUrls(id);
  savePodConfig({
    activePodId: id,
    comfyuiHost: urls.comfyui,
    ollamaHost: urls.ollama,
    ttsHost: urls.tts,
    lastActivityAt: new Date().toISOString(),
  });
  return Response.json({ ok: true, ...urls, podId: id });
}
