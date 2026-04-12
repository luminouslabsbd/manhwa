import { getInstanceStatus, startInstance, stopInstance } from "@/lib/vastai";

const INSTANCE_ID = process.env.VASTAI_INSTANCE_ID || "";

// GET /api/runpod — status (now powered by Vast.ai)
export async function GET() {
  if (!INSTANCE_ID) return Response.json({ error: "No VASTAI_INSTANCE_ID configured" }, { status: 400 });

  try {
    const inst = await getInstanceStatus(INSTANCE_ID);
    // Map to the shape the settings page expects
    return Response.json({
      comfy: {
        id: inst.id,
        name: `RTX 4090 (Vast.ai)`,
        desiredStatus: inst.running ? "RUNNING" : inst.status || "STOPPED",
        costPerHr: inst.costPerHr,
        runtime: { uptimeInSeconds: inst.uptimeSeconds },
      },
      provider: "vastai",
    });
  } catch (e) {
    return Response.json({ comfy: { error: String(e), desiredStatus: "UNKNOWN" } });
  }
}

// POST /api/runpod — start/stop (now powered by Vast.ai)
export async function POST(req: Request) {
  const { action } = await req.json();
  if (!INSTANCE_ID) return Response.json({ error: "No VASTAI_INSTANCE_ID configured" }, { status: 400 });

  try {
    if (action === "start") {
      const result = await startInstance(INSTANCE_ID);
      return Response.json({ results: [result] });
    } else if (action === "stop") {
      const result = await stopInstance(INSTANCE_ID);
      return Response.json({ results: [result] });
    }
    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
