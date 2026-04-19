import { getPodStatus, deletePod } from "@/lib/runpod";
import { getPodConfig, savePodConfig } from "@/lib/pod-config";
import { verifyAdmin } from "@/lib/dal";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  const pod = await getPodStatus(id);
  if (!pod) return Response.json({ error: "Pod not found" }, { status: 404 });
  return Response.json({ pod });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  await deletePod(id);
  // Clear any host pointers that reference this pod (per-service + legacy).
  const cfg = getPodConfig();
  const clears: Parameters<typeof savePodConfig>[0] = {};
  if (cfg.activePodId === id) clears.activePodId = undefined;
  if (cfg.activeImagePodId === id)  { clears.activeImagePodId  = undefined; clears.comfyuiHost = undefined; }
  if (cfg.activeVideoPodId === id)  { clears.activeVideoPodId  = undefined; clears.videoHost   = undefined; }
  if (cfg.activeOllamaPodId === id) { clears.activeOllamaPodId = undefined; clears.ollamaHost  = undefined; }
  if (cfg.activeTtsPodId === id)    { clears.activeTtsPodId    = undefined; clears.ttsHost     = undefined; }
  if (Object.keys(clears).length) savePodConfig(clears);
  return Response.json({ ok: true });
}
