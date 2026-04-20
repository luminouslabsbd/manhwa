import { readFileSync } from "fs";
import path from "path";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { listPods, getGpuTypes, createPod, buildPodName, NoCapacityError } from "@/lib/runpod";
import { verifyAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { translateSelection } from "@/lib/pod-model-translation";
import { getSecret } from "@/lib/secrets";

// GET /api/admin/pods — list all pods + available GPU types, plus which
// catalog models each pod was provisioned with (read from pod_models).
export async function GET() {
  await verifyAdmin();
  const [podsRes, gpuRes] = await Promise.all([
    listPods().then((v) => ({ ok: true as const, v })).catch((e) => ({ ok: false as const, e })),
    getGpuTypes().then((v) => ({ ok: true as const, v })).catch((e) => ({ ok: false as const, e })),
  ]);

  const pods = podsRes.ok ? podsRes.v : [];
  const gpuTypes = gpuRes.ok ? gpuRes.v : [];

  // Stitch pod_id → [modelIds] onto each pod so the UI can show what's on it.
  // Also resolve each modelId into its minimal catalog view so the UI doesn't
  // need a second round-trip per pod.
  const podIds = pods.map((p) => p.id);
  const podModelRows = podIds.length
    ? await prisma.podModel.findMany({ where: { pod_id: { in: podIds } } })
    : [];
  const allModelIds = Array.from(new Set(podModelRows.flatMap((r) => r.model_ids)));
  const catalogRows = allModelIds.length
    ? await prisma.model.findMany({
        where: { id: { in: allModelIds } },
        select: { id: true, category: true, label: true, disk_gb: true },
      })
    : [];
  const catalogById = new Map(catalogRows.map((m) => [m.id, m]));
  const podsWithModels = pods.map((p) => {
    const row = podModelRows.find((r) => r.pod_id === p.id);
    const installedModels = (row?.model_ids ?? []).map((id) => {
      const m = catalogById.get(id);
      return m
        ? { id: m.id, category: m.category, label: m.label, disk_gb: m.disk_gb, known: true }
        : { id, category: "unknown", label: id, disk_gb: 0, known: false };
    });
    return { ...p, installedModels };
  });

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

  return Response.json({ pods: podsWithModels, gpuTypes: availableGpus, errors });
}

// POST /api/admin/pods — create a new pod
export async function POST(req: Request) {
  try {
    await verifyAdmin();
    const body = await req.json().catch(() => ({}));
    const { gpuTypeId, ollamaModel, cloudType, components, modelIds } = body as {
      gpuTypeId: string;
      ollamaModel?: string;
      cloudType?: "COMMUNITY" | "SECURE";
      components?: import("@/lib/runpod").PodComponents;
      /**
       * New catalog-driven path: client sends an array of Model.id values
       * picked in the wizard. We look them up, translate to legacy INSTALL_*
       * booleans for canonical models, and concat install_script of the rest
       * into EXTRA_INSTALL_SCRIPT. `components` is still accepted for back-compat.
       */
      modelIds?: string[];
    };

    if (!gpuTypeId) return Response.json({ error: "gpuTypeId required" }, { status: 400 });

    // Catalog path overrides any `components` passed in. If the client sent
    // both, prefer modelIds — that's the new flow.
    let resolvedComponents = components;
    let extraInstallScript = "";
    let resolvedOllamaModel = ollamaModel;
    let resolvedTtsEngines: Array<"edge-tts" | "xtts-v2" | "mms-tts-bengali" | "whisperspeech"> = [];
    let resolvedCategories: string[] = [];
    if (Array.isArray(modelIds) && modelIds.length > 0) {
      const rows = await prisma.model.findMany({
        where: { id: { in: modelIds }, is_enabled: true },
        select: { id: true, category: true, install_script: true, default_params: true },
      });
      resolvedCategories = Array.from(new Set(rows.map((r) => r.category)));
      const missing = modelIds.filter((id) => !rows.find((r) => r.id === id));
      if (missing.length) {
        return Response.json({ error: `Unknown or disabled models: ${missing.join(", ")}` }, { status: 400 });
      }
      const translated = translateSelection(rows.map((r) => ({
        id: r.id,
        category: r.category as "image" | "video" | "tts" | "content",
        install_script: r.install_script,
      })));
      resolvedComponents = translated.components;
      extraInstallScript = translated.extraInstallScript;
      if (translated.ttsEngines.length) resolvedTtsEngines = translated.ttsEngines;

      // If the wizard included a content model and didn't override the Ollama
      // tag explicitly, pull the tag from the model's default_params.model
      // field so e.g. selecting `gemma-3-12b` auto-pulls `gemma3:12b`.
      if (!resolvedOllamaModel) {
        const contentRow = rows.find((r) => r.category === "content");
        const tag = contentRow?.default_params && (contentRow.default_params as Record<string, unknown>).model;
        if (typeof tag === "string" && tag) resolvedOllamaModel = tag;
      }
    }

    // Read pod-setup.sh and base64 encode
    const setupPath = path.join(process.cwd(), "scripts", "pod-setup.sh");
    let setupScript: string;
    try {
      setupScript = readFileSync(setupPath).toString("base64");
    } catch {
      return Response.json({ error: "scripts/pod-setup.sh not found" }, { status: 500 });
    }

    // Secrets come from the admin Settings UI first, env var second. Keeps
    // rotation live without restart (getSecret cache TTL = 30s).
    const [hfToken, civitaiToken] = await Promise.all([
      getSecret("HF_TOKEN"),
      getSecret("CIVITAI_TOKEN"),
    ]);
    const pod = await createPod({
      gpuTypeId,
      setupScript,
      hfToken,
      civitaiToken,
      publicKey: process.env.PUBLIC_KEY ?? "",
      ollamaModel: resolvedOllamaModel ?? process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
      cloudType,
      components: resolvedComponents,
      extraInstallScript,
      ttsEngines: resolvedTtsEngines.length > 0 ? resolvedTtsEngines : undefined,
      // Name the pod by the services it runs (e.g. ti-img-tts-llm-mo5…)
      // so the RunPod dashboard shows what the pod does at a glance.
      // Falls back to the gpu-based default name for older clients that
      // don't send modelIds.
      name: resolvedCategories.length > 0
        ? buildPodName(gpuTypeId, resolvedCategories)
        : undefined,
    });

    // Persist which catalog model IDs this pod was provisioned with so the
    // admin UI can render per-model readiness later. RunPod itself only keeps
    // the INSTALL_* env booleans, not the original slugs.
    if (Array.isArray(modelIds) && modelIds.length > 0) {
      await prisma.podModel.upsert({
        where: { pod_id: pod.id },
        update: { model_ids: modelIds, created_at: new Date().toISOString() },
        create: { pod_id: pod.id, model_ids: modelIds, created_at: new Date().toISOString() },
      });
    }

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
