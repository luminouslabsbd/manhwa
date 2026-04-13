import { readFileSync } from "fs";
import path from "path";
import { listPods, getGpuTypes, createPod } from "@/lib/runpod";
import { verifyAdmin } from "@/lib/dal";

// GET /api/admin/pods — list all pods + available GPU types
export async function GET() {
  await verifyAdmin();
  const [pods, gpuTypes] = await Promise.all([
    listPods().catch(() => []),
    getGpuTypes().catch(() => []),
  ]);
  // Only community cloud GPUs with price info
  const availableGpus = gpuTypes
    .filter((g) => g.communityCloud && g.communityPrice && g.communityPrice > 0)
    .sort((a, b) => (b.communityPrice ?? 0) - (a.communityPrice ?? 0));
  return Response.json({ pods, gpuTypes: availableGpus });
}

// POST /api/admin/pods — create a new pod
export async function POST(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));
  const { gpuTypeId, ollamaModel } = body as { gpuTypeId: string; ollamaModel?: string };

  if (!gpuTypeId) return Response.json({ error: "gpuTypeId required" }, { status: 400 });

  // Read pod-setup.sh and base64 encode
  const setupPath = path.join(process.cwd(), "scripts", "pod-setup.sh");
  let setupScript: string;
  try {
    setupScript = readFileSync(setupPath).toString("base64");
  } catch {
    return Response.json({ error: "scripts/pod-setup.sh not found" }, { status: 500 });
  }

  const pod = await createPod({
    gpuTypeId,
    setupScript,
    hfToken: process.env.HF_TOKEN ?? "",
    civitaiToken: process.env.CIVITAI_TOKEN ?? "",
    publicKey: process.env.PUBLIC_KEY ?? "",
    ollamaModel: ollamaModel ?? process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  });

  return Response.json({ ok: true, pod }, { status: 201 });
}
