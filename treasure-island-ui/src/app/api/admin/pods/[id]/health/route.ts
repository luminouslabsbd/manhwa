import { verifyAdmin } from "@/lib/dal";
import { getPodProxyUrls } from "@/lib/runpod";

type Probe = { up: boolean; ms: number; error?: string; detail?: unknown };

async function probe(
  url: string,
  init: RequestInit = {},
  okIfStatus: (s: number) => boolean = (s) => s >= 200 && s < 500,
): Promise<Probe> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
    const ms = Date.now() - t0;
    if (!okIfStatus(res.status)) return { up: false, ms, error: `HTTP ${res.status}` };
    return { up: true, ms };
  } catch (e) {
    return { up: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/admin/pods/[id]/health?services=image,tts,ollama
// Probes only the services the caller cares about. Passing no `services` (or
// `services=all`) probes everything — used when a pod is unassigned. When the
// pod is dedicated to e.g. TTS only, the ComfyUI probe is skipped so the pill
// strip doesn't show a spurious red "down".
const SKIP: Probe = { up: false, ms: 0, error: "not-probed" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  const urls = getPodProxyUrls(id);

  const url = new URL(req.url);
  const raw = (url.searchParams.get("services") || "").trim();
  const wantAll = !raw || raw === "all";
  const wanted = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  const want = (s: "image" | "video" | "tts" | "ollama") => wantAll || wanted.has(s);
  const wantComfy  = want("image") || want("video");
  const wantTts    = want("tts");
  const wantOllama = want("ollama");

  const [comfyui, ollama, tts, comfyModels] = await Promise.all([
    wantComfy  ? probe(`${urls.comfyui}/system_stats`, {}, (s) => s === 200) : Promise.resolve(SKIP),
    wantOllama ? probe(`${urls.ollama}/api/tags`,       {}, (s) => s === 200) : Promise.resolve(SKIP),
    wantTts    ? probe(`${urls.tts}/health`,            {}, (s) => s === 200 || s === 404) : Promise.resolve(SKIP),
    wantComfy
      ? probe(`${urls.comfyui}/object_info/CheckpointLoaderSimple`, {}, (s) => s === 200)
          .then(async (p) => {
            if (!p.up) return p;
            try {
              const r = await fetch(`${urls.comfyui}/object_info/CheckpointLoaderSimple`, {
                cache: "no-store",
              });
              const j = await r.json();
              const list =
                j?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
              return { ...p, detail: { checkpointCount: Array.isArray(list) ? list.length : 0 } };
            } catch {
              return p;
            }
          })
      : Promise.resolve(SKIP),
  ]);

  const modelsLoaded =
    wantComfy && comfyui.up &&
    typeof (comfyModels.detail as { checkpointCount?: number } | undefined)?.checkpointCount ===
      "number" &&
    ((comfyModels.detail as { checkpointCount: number }).checkpointCount ?? 0) > 0;

  return Response.json({
    id,
    urls,
    probed: { comfyui: wantComfy, tts: wantTts, ollama: wantOllama },
    services: { comfyui, ollama, tts },
    models: {
      loaded: modelsLoaded,
      checkpointCount:
        (comfyModels.detail as { checkpointCount?: number } | undefined)?.checkpointCount ?? 0,
    },
  });
}
