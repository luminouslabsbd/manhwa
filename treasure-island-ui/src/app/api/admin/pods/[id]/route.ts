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
  // Clear active config if this was the active pod
  const cfg = getPodConfig();
  if (cfg.activePodId === id) {
    savePodConfig({ activePodId: undefined, comfyuiHost: undefined, ollamaHost: undefined, ttsHost: undefined });
  }
  return Response.json({ ok: true });
}
