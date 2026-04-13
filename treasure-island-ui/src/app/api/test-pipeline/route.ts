import { getHost, queuePrompt, getSystemStats, getHistory } from "@/lib/comfyui";

const TIMEOUT_MS = 180_000; // max wait for image generation (cold model load can take ~2min)

function withTimeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

type TestResult = {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
};

async function runTest(name: string, fn: () => Promise<string | undefined>): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - t0, detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, error: String(e) };
  }
}

// ── Minimal ComfyUI workflow: text → 256×256 image, 4 steps ──────────────────
function minimalImageWorkflow(model: string): Record<string, unknown> {
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: model } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "a red apple on a white table", clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "blurry, ugly", clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: 256, height: 256, batch_size: 1 } },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0],
        seed: Math.floor(Math.random() * 999999), steps: 4, cfg: 7.0, sampler_name: "euler", scheduler: "normal", denoise: 1.0,
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "test_pipeline" } },
  };
}

// Poll history until prompt completes or timeout
async function pollUntilDone(promptId: string, host: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const hist = await getHistory(promptId, host);
    const entry = hist[promptId];
    if (!entry) continue;
    const outputs = entry.outputs ?? {};
    for (const nodeOut of Object.values(outputs)) {
      const images = (nodeOut as { images?: Array<{ filename: string }> }).images;
      if (images?.length) return images[0].filename;
    }
    // Check for errors in status
    const status = entry.status;
    if (status?.status_str === "error") throw new Error(status.messages?.join("; ") ?? "generation error");
  }
  throw new Error(`timed out after ${timeoutMs / 1000}s`);
}

export async function GET() {
  const results: TestResult[] = [];
  const comfyHost = getHost();
  const ttsHost = process.env.TTS_HOST ?? "";
  const ollamaHost = process.env.OLLAMA_HOST ?? "";
  const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

  // ── 1. ComfyUI reachable ──────────────────────────────────────────────────
  results.push(
    await runTest("comfyui:reachable", async () => {
      const raw = await getSystemStats(comfyHost);
      // Response is { system: {...}, devices: [...] }
      const stats = raw.system ?? raw;
      return `v${stats.comfyui_version} torch=${stats.pytorch_version}`;
    }),
  );

  // ── 2. ComfyUI GPU accessible ─────────────────────────────────────────────
  results.push(
    await runTest("comfyui:gpu", async () => {
      const res = await fetch(`${comfyHost}/system_stats`, { cache: "no-store", signal: withTimeout(8000) });
      const d = await res.json();
      // Response may be { system: {...}, devices: [...] } or flat
      const devices = d.devices ?? [];
      const gpu = devices.find((x: { type: string }) => x.type === "cuda");
      if (!gpu) throw new Error("no CUDA device found");
      const vram_gb = ((gpu.vram_total ?? 0) / 1024 / 1024 / 1024).toFixed(1);
      return `${gpu.name} ${vram_gb}GB`;
    }),
  );

  // ── 3. ComfyUI model list ─────────────────────────────────────────────────
  let availableModel: string | null = null;
  results.push(
    await runTest("comfyui:models", async () => {
      const res = await fetch(`${comfyHost}/object_info/CheckpointLoaderSimple`, {
        cache: "no-store", signal: withTimeout(8000),
      });
      const d = await res.json();
      const models: string[] = d?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
      if (!models.length) throw new Error("no checkpoints found");
      // Prefer animagine → juggernaut → first available
      availableModel =
        models.find((m) => m.toLowerCase().includes("animagine")) ??
        models.find((m) => m.toLowerCase().includes("juggernaut")) ??
        models[0];
      return `${models.length} models — using ${availableModel}`;
    }),
  );

  // ── 4. ComfyUI image generation (end-to-end) ─────────────────────────────
  results.push(
    await runTest("comfyui:generate", async () => {
      if (!availableModel) throw new Error("no model available (step 3 failed)");
      const wf = minimalImageWorkflow(availableModel);
      const { prompt_id } = await queuePrompt(wf, comfyHost);
      const filename = await pollUntilDone(prompt_id, comfyHost, TIMEOUT_MS);
      return `prompt_id=${prompt_id} → ${filename}`;
    }),
  );

  // ── 5. TTS reachable ──────────────────────────────────────────────────────
  if (ttsHost) {
    results.push(
      await runTest("tts:reachable", async () => {
        const res = await fetch(`${ttsHost}/health`, { cache: "no-store", signal: withTimeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        return `engine=${d.engine ?? "unknown"}`;
      }),
    );

    // ── 6. TTS generate ──────────────────────────────────────────────────────
    results.push(
      await runTest("tts:generate", async () => {
        const res = await fetch(`${ttsHost}/api/tts/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Pipeline test.", voice: "default" }),
          signal: withTimeout(20000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const d = await res.json();
        if (!d.success) throw new Error(d.error ?? "TTS failed");
        return `${d.duration_ms}ms audio`;
      }),
    );
  }

  // ── 7. Ollama reachable ───────────────────────────────────────────────────
  if (ollamaHost) {
    results.push(
      await runTest("ollama:reachable", async () => {
        const res = await fetch(`${ollamaHost}/api/tags`, { cache: "no-store", signal: withTimeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        const models: Array<{ name: string }> = d.models ?? [];
        return `${models.length} models: ${models.map((m) => m.name).join(", ") || "none"}`;
      }),
    );

    // ── 8. Ollama inference ─────────────────────────────────────────────────
    results.push(
      await runTest("ollama:inference", async () => {
        const res = await fetch(`${ollamaHost}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: ollamaModel, prompt: "Reply with one word: yes", stream: false }),
          signal: withTimeout(60000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        const tok = d.eval_count ?? 0;
        return `${tok} tokens, response: "${(d.response ?? "").trim().slice(0, 60)}"`;
      }),
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  return Response.json({
    summary: { passed, failed, total: results.length, totalMs },
    results,
    timestamp: new Date().toISOString(),
  });
}
