import { readFileSync } from "fs";
import path from "path";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { listPods, getGpuTypes, createPod, NoCapacityError } from "@/lib/runpod";
import { verifyAdmin } from "@/lib/dal";

// GET /api/admin/pods — list all pods + available GPU types
export async function GET() {
  await verifyAdmin();
  const [podsRes, gpuRes] = await Promise.all([
    listPods().then((v) => ({ ok: true as const, v })).catch((e) => ({ ok: false as const, e })),
    getGpuTypes().then((v) => ({ ok: true as const, v })).catch((e) => ({ ok: false as const, e })),
  ]);

  const pods = podsRes.ok ? podsRes.v : [];
  const gpuTypes = gpuRes.ok ? gpuRes.v : [];

  // Show only GPUs that have at least one bookable cloud AND current stock.
  // `stockStatus: null` means no host is offering this GPU right now — hide it.
  const availableGpus = gpuTypes
    .filter((g) => g.stockStatus != null)
    .filter((g) => (g.communityPrice && g.communityPrice > 0) || (g.securePrice && g.securePrice > 0))
    .sort((a, b) => {
      const ap = a.communityPrice ?? a.securePrice ?? 0;
      const bp = b.communityPrice ?? b.securePrice ?? 0;
      return ap - bp;
    });

  const errors: { pods?: string; gpuTypes?: string } = {};
  if (!podsRes.ok) errors.pods = podsRes.e instanceof Error ? podsRes.e.message : String(podsRes.e);
  if (!gpuRes.ok) errors.gpuTypes = gpuRes.e instanceof Error ? gpuRes.e.message : String(gpuRes.e);

  return Response.json({ pods, gpuTypes: availableGpus, errors });
}

// POST /api/admin/pods — create a new pod
export async function POST(req: Request) {
  try {
    await verifyAdmin();
    const body = await req.json().catch(() => ({}));
    const { gpuTypeId, ollamaModel, cloudType, components } = body as {
      gpuTypeId: string;
      ollamaModel?: string;
      cloudType?: "COMMUNITY" | "SECURE";
      components?: import("@/lib/runpod").PodComponents;
    };

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
      cloudType,
      components,
    });

    return Response.json({ ok: true, pod }, { status: 201 });
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof NoCapacityError) {
      // Tell the client it can retry on Secure cloud (or pick another GPU).
      return Response.json(
        {
          error: `No ${e.cloudType.toLowerCase()} cloud machines available for this GPU right now.`,
          noCapacity: true,
          triedCloudType: e.cloudType,
          canRetrySecure: e.cloudType === "COMMUNITY",
        },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pods.POST] create failed:", msg);
    return Response.json({ error: msg || "Failed to create pod" }, { status: 500 });
  }
}
