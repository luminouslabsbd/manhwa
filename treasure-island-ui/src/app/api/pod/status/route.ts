import { getInstanceStatus } from "@/lib/vastai";
import { getQueue, getSystemStats, getHost } from "@/lib/comfyui";

const INSTANCE_ID = process.env.VASTAI_INSTANCE_ID || "";

export async function GET() {
  if (!INSTANCE_ID) return Response.json({ error: "No VASTAI_INSTANCE_ID configured", status: "UNKNOWN", running: false });

  try {
    const inst = await getInstanceStatus(INSTANCE_ID);
    const comfyHost = getHost(); // Uses COMFYUI_HOST env (localhost:8188 via SSH tunnel)

    let queue = null;
    let comfyReady = false;
    if (inst.running) {
      try {
        await getSystemStats(comfyHost);
        comfyReady = true;
        const q = await getQueue(comfyHost);
        queue = { running: q.queue_running?.length ?? 0, pending: q.queue_pending?.length ?? 0 };
      } catch { comfyReady = false; }
    }

    return Response.json({
      instanceId: INSTANCE_ID,
      status: inst.status,
      running: inst.running,
      comfyReady,
      costPerHr: inst.costPerHr,
      uptimeSeconds: inst.uptimeSeconds,
      gpu: inst.gpu,
      queue,
      provider: "vastai",
    });
  } catch (e) {
    return Response.json({ error: String(e), status: "UNKNOWN", running: false });
  }
}
