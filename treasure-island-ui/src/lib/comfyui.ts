import { resolveComfyUIHost } from "@/lib/pod-config";

// ── Config ──────────────────────────────────────────────────────────
const DEFAULT_CHECKPOINT = "flux1-schnell-fp8.safetensors";
const NEG_PROMPT = "ugly, blurry, low quality, distorted, text, watermark, deformed, bad anatomy, nsfw";

// Model-specific CFG: higher = stricter prompt following
function getCfg(model?: string | null): number {
  const m = (model || DEFAULT_CHECKPOINT).toLowerCase();
  if (m.includes("juggernaut")) return 9.0;
  if (m.includes("animagine")) return 7.5;
  return 7.0; // bigLust default
}

/** Returns true if the model name is a FLUX diffusion model (uses UNETLoader workflow) */
export function isFluxModel(model: string): boolean {
  return model.toLowerCase().startsWith("flux1-") || model.toLowerCase().startsWith("flux_");
}

export type LoraSpec = {
  name: string;
  strengthModel?: number; // default 0.8
  strengthClip?: number;  // default 0.8
};

/**
 * Inserts a LoRA chain into `nodes` between a model/clip source and downstream nodes.
 * Returns the final [model, clip] refs after all LoRAs are applied.
 */
function addLoraChain(
  nodes: Record<string, unknown>,
  modelRef: [string, number],
  clipRef: [string, number],
  loras: LoraSpec[],
): { modelRef: [string, number]; clipRef: [string, number] } {
  for (let i = 0; i < loras.length; i++) {
    const id = `lora_${i + 1}`;
    nodes[id] = {
      class_type: "LoraLoader",
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: loras[i].name,
        strength_model: loras[i].strengthModel ?? 0.8,
        strength_clip: loras[i].strengthClip ?? 0.8,
      },
    };
    modelRef = [id, 0];
    clipRef = [id, 1];
  }
  return { modelRef, clipRef };
}

let _cachedHost: string | null = null;
let _cacheTime = 0;

export async function resolveHost(): Promise<string> {
  // If explicit host is set, always use it
  if (process.env.COMFYUI_HOST) return process.env.COMFYUI_HOST;

  // Cache for 30s to avoid hammering Vast.ai API
  if (_cachedHost && Date.now() - _cacheTime < 30000) return _cachedHost;

  // Try to resolve from Vast.ai
  const instanceId = process.env.VASTAI_INSTANCE_ID;
  if (instanceId) {
    try {
      const { getInstanceStatus } = await import("@/lib/vastai");
      const status = await getInstanceStatus(instanceId);
      if (status.comfyHost) {
        _cachedHost = status.comfyHost;
        _cacheTime = Date.now();
        return _cachedHost;
      }
    } catch { /* fall through */ }
  }
  return "http://localhost:8188";
}

export function getHost() {
  return resolveComfyUIHost();
}

/** Ensures model name has a file extension (.safetensors assumed if missing) */
function ensureExt(name: string): string {
  return /\.(safetensors|ckpt|pt|pth|bin)$/i.test(name) ? name : `${name}.safetensors`;
}

export function getModelName(_type?: string, override?: string | null) {
  const name = override || process.env.COMFYUI_MODEL || DEFAULT_CHECKPOINT;
  return ensureExt(name);
}

function withTimeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// ── API helpers ─────────────────────────────────────────────────────
export async function getQueue(host = getHost()) {
  const res = await fetch(`${host}/queue`, { cache: "no-store", signal: withTimeout(5000) });
  return res.json();
}

export async function getHistory(promptId: string, host = getHost()) {
  const res = await fetch(`${host}/history/${promptId}`, { cache: "no-store", signal: withTimeout(5000) });
  return res.json();
}

export async function getSystemStats(host = getHost()) {
  const res = await fetch(`${host}/system_stats`, { cache: "no-store", signal: withTimeout(5000) });
  return res.json();
}

export async function queuePrompt(workflow: Record<string, unknown>, host = getHost()) {
  const res = await fetch(`${host}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
    signal: withTimeout(10000),
  });
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // ComfyUI returns 200 even for validation errors — check for error/node_errors
  if (data.error) {
    const nodeErrors = data.node_errors ?? {};
    const details = Object.entries(nodeErrors)
      .map(([nid, info]: [string, unknown]) => {
        const errs = (info as { errors?: Array<{ details?: string }> }).errors ?? [];
        return errs.map((e) => `node ${nid}: ${e.details ?? "unknown"}`).join("; ");
      })
      .filter(Boolean)
      .join(" | ");
    throw new Error(`ComfyUI validation: ${data.error.message ?? "failed"}${details ? ` — ${details}` : ""}`);
  }
  if (!data.prompt_id) throw new Error("ComfyUI returned no prompt_id");
  return data as { prompt_id: string };
}

// Upload image via HTTP multipart (works when proxy allows large uploads)
async function uploadImageHttp(buffer: Buffer, filename: string, host: string): Promise<{ name: string; subfolder: string }> {
  const formData = new FormData();
  const arrayBuf = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : new Uint8Array(buffer).buffer;
  formData.append("image", new Blob([arrayBuf], { type: "image/png" }), filename);
  const res = await fetch(`${host}/upload/image`, { method: "POST", body: formData, signal: withTimeout(30000) });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return (await res.json()) as { name: string; subfolder: string };
}

// Upload image via SSH → ComfyUI input folder (bypasses Cloudflare proxy 520 errors)
async function uploadImageSSH(buffer: Buffer, filename: string): Promise<{ name: string; subfolder: string }> {
  const { execFile } = await import("child_process");
  const { homedir } = await import("os");
  const { join } = await import("path");

  // Get SSH connection from RunPod API
  const apiKey = process.env.RUNPOD_API_KEY;
  const podId = process.env.RUNPOD_POD_ID;
  if (!apiKey || !podId) throw new Error("RUNPOD_API_KEY/POD_ID not set for SSH upload");

  const gql = await fetch(`https://api.runpod.io/graphql?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: `query { pod(input: { podId: "${podId}" }) { runtime { ports { ip privatePort publicPort type } } } }` }),
    signal: withTimeout(10000),
  });
  const gqlData = await gql.json() as { data?: { pod?: { runtime?: { ports?: Array<{ ip: string; privatePort: number; publicPort: number; type: string }> } } } };
  const ports = gqlData?.data?.pod?.runtime?.ports ?? [];
  const sshPort = ports.find((p) => p.privatePort === 22 && p.type === "tcp");
  if (!sshPort) throw new Error("SSH port not found on pod");

  const keyPaths = [join(homedir(), ".ssh", "id_ed25519"), join(homedir(), ".ssh", "id_rsa"), join(homedir(), ".ssh", "runpod")];
  const { accessSync } = await import("fs");
  const keyPath = keyPaths.find((p) => { try { accessSync(p); return true; } catch { return false; } });

  const destPath = `/workspace/ComfyUI/input/${filename}`;
  await new Promise<void>((resolve, reject) => {
    const args = ["-p", String(sshPort.publicPort), "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes",
      ...(keyPath ? ["-i", keyPath] : []), `root@${sshPort.ip}`, `cat > ${destPath}`];
    const proc = execFile("ssh", args, { timeout: 30000 }, (err) => err ? reject(err) : resolve());
    proc.stdin!.write(buffer);
    proc.stdin!.end();
  });

  return { name: filename, subfolder: "" };
}

export async function uploadImage(buffer: Buffer, filename: string, host = getHost()): Promise<{ name: string; subfolder: string }> {
  // Try HTTP first; on proxy errors (520, 502, 524) fall back to SSH
  try {
    return await uploadImageHttp(buffer, filename, host);
  } catch (httpErr) {
    const httpMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
    // SSH fallback for proxy errors OR any HTTP failure
    try {
      return await uploadImageSSH(buffer, filename);
    } catch (sshErr) {
      const sshMsg = sshErr instanceof Error ? sshErr.message : String(sshErr);
      // Both failed — ComfyUI is likely busy generating.
      // Fall back to the expected filename; if it was uploaded earlier this session it will still be in input/.
      // ComfyUI queues prompts even while generating, so this allows queueing without blocking.
      if (sshMsg.includes("Connection reset") || sshMsg.includes("timed out") || sshMsg.includes("ECONNRESET") ||
          httpMsg.includes("520") || httpMsg.includes("502") || httpMsg.includes("524") || httpMsg.includes("aborted") || httpMsg.includes("fetch failed")) {
        console.warn(`[uploadImage] Both HTTP and SSH uploads failed (pod busy) — using cached filename: ${filename}`);
        return { name: filename, subfolder: "" };
      }
      throw sshErr;
    }
  }
}

export async function fetchImageAsBase64(filename: string, subfolder: string, host = getHost()) {
  const url = `${host}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
  const res = await fetch(url, { signal: withTimeout(30000) });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

// ══════════════════════════════════════════════════════════════════════
// WORKFLOW 1: SDXL Text-to-Image
// CheckpointLoaderSimple → [LoraLoader chain] → CLIPTextEncode → KSampler → VAEDecode → SaveImage
// ══════════════════════════════════════════════════════════════════════
export function buildFluxWorkflow(
  prompt: string, seed: number, width = 1024, height = 1024, steps = 25,
  modelOverride?: string | null, loras?: LoraSpec[]
) {
  if (steps < 15) steps = 25;
  const prefix = `studio/${Date.now()}`;
  const nodes: Record<string, unknown> = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: {
      ckpt_name: getModelName("t2v", modelOverride),
    }},
  };

  const { modelRef, clipRef } = addLoraChain(nodes, ["1", 0], ["1", 1], loras ?? []);

  return Object.assign(nodes, {
    "2": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: prompt }},
    "3": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: NEG_PROMPT }},
    "4": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 }},
    "5": { class_type: "KSampler", inputs: {
      model: modelRef, positive: ["2", 0], negative: ["3", 0],
      latent_image: ["4", 0], seed, steps, cfg: getCfg(modelOverride),
      sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1.0,
    }},
    "6": { class_type: "VAEDecode", inputs: { vae: ["1", 2], samples: ["5", 0] }},
    "7": { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["6", 0] }},
  });
}

// ══════════════════════════════════════════════════════════════════════
// WORKFLOW 1b: FLUX.1-schnell Text-to-Image
// UNETLoader + DualCLIPLoader(flux) → CLIPTextEncodeFlux → KSampler(4 steps, cfg=1) → SaveImage
// Model files needed in models/unet/, models/clip/, models/vae/
// ══════════════════════════════════════════════════════════════════════
const FLUX_CLIP_L  = "clip_l.safetensors";
const FLUX_T5      = "t5xxl_fp8_e4m3fn.safetensors";
const FLUX_VAE     = "ae.safetensors";

export function buildFluxSchnellWorkflow(
  prompt: string, seed: number, width = 1024, height = 1024,
  loras?: LoraSpec[], modelOverride?: string | null
) {
  const unetName = ensureExt(modelOverride ?? "flux1-schnell-fp8.safetensors");
  const isDev = unetName.toLowerCase().includes("dev");
  const steps = isDev ? 20 : 4;
  const prefix = `studio/flux_${Date.now()}`;
  const nodes: Record<string, unknown> = {
    // Load FLUX transformer (fp8 quantized)
    "1": { class_type: "UNETLoader", inputs: {
      unet_name: unetName,
      weight_dtype: "fp8_e4m3fn",
    }},
    // Dual CLIP: CLIP-L (short) + T5-XXL fp8 (long), type=flux
    "2": { class_type: "DualCLIPLoader", inputs: {
      clip_name1: FLUX_CLIP_L,
      clip_name2: FLUX_T5,
      type: "flux",
    }},
    // FLUX VAE
    "3": { class_type: "VAELoader", inputs: { vae_name: FLUX_VAE }},
  };

  // LoRAs sit between model/clip and the sampler
  const { modelRef, clipRef } = addLoraChain(nodes, ["1", 0], ["2", 0], loras ?? []);

  return Object.assign(nodes, {
    // FLUX text encoding: clip_l gets short prompt, t5xxl gets full prompt
    // guidance=3.5 is embedded in cond (ignored by schnell but harmless)
    "4": { class_type: "CLIPTextEncodeFlux", inputs: {
      clip: clipRef,
      clip_l: prompt.slice(0, 77),  // CLIP-L token limit
      t5xxl: prompt,
      guidance: 3.5,
    }},
    // Empty negative (FLUX schnell uses cfg=1, no negative needed)
    "5": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: "" }},
    "6": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 }},
    // schnell=4 steps cfg=1, dev=20 steps cfg=3.5
    "7": { class_type: "KSampler", inputs: {
      model: modelRef,
      positive: ["4", 0], negative: ["5", 0],
      latent_image: ["6", 0],
      seed, steps, cfg: isDev ? 3.5 : 1.0,
      sampler_name: "euler", scheduler: "simple", denoise: 1.0,
    }},
    "8": { class_type: "VAEDecode", inputs: { vae: ["3", 0], samples: ["7", 0] }},
    "9": { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["8", 0] }},
  });
}

/**
 * Auto-dispatch: uses FLUX.1-schnell workflow if model name starts with "flux1-",
 * otherwise uses SDXL/checkpoint workflow.
 */
export function buildImageWorkflow(
  prompt: string, seed: number, width = 1024, height = 1024, steps = 25,
  modelOverride?: string | null, loras?: LoraSpec[]
) {
  if (modelOverride && isFluxModel(modelOverride)) {
    return buildFluxSchnellWorkflow(prompt, seed, width, height, loras, modelOverride);
  }
  return buildFluxWorkflow(prompt, seed, width, height, steps, modelOverride, loras);
}

// ══════════════════════════════════════════════════════════════════════
// WORKFLOW 2: Shot from Character Reference (IPAdapter + text-to-image)
// Text-to-image driven by prompt, with character face/style injected
// via IPAdapter. Prompt fully controls the scene; reference only
// influences character appearance at weight 0.6.
// Falls back to img2img if IPAdapter nodes aren't available.
// ══════════════════════════════════════════════════════════════════════
const IPADAPTER_SDXL  = "ip-adapter-plus_sdxl_vit-h.safetensors";
const CLIP_VISION_SDXL = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";
const IPADAPTER_FLUX  = "ip-adapter-flux-dev.safetensors";
const CLIP_VISION_FLUX = "sigclip_vit_patch14_384.safetensors";

export function buildShotFromBaseWorkflow(
  prompt: string, baseImageName: string, seed: number,
  width = 1024, height = 1024, steps = 25, modelOverride?: string | null,
  useIPAdapter = true, loras?: LoraSpec[]
) {
  // FLUX: use XLabs IP-Adapter for reference image conditioning
  if (modelOverride && isFluxModel(modelOverride)) {
    if (useIPAdapter) {
      const isDev = modelOverride.toLowerCase().includes("dev");
      const steps = isDev ? 20 : 4;
      const prefix = `studio/flux_ipa_${Date.now()}`;
      return {
        "1": { class_type: "UNETLoader", inputs: { unet_name: ensureExt(modelOverride), weight_dtype: "fp8_e4m3fn" }},
        "2": { class_type: "DualCLIPLoader", inputs: { clip_name1: FLUX_CLIP_L, clip_name2: FLUX_T5, type: "flux" }},
        "3": { class_type: "VAELoader", inputs: { vae_name: FLUX_VAE }},
        "4": { class_type: "CLIPVisionLoader", inputs: { clip_name: CLIP_VISION_FLUX }},
        "5": { class_type: "LoadImage", inputs: { image: baseImageName }},
        "6": { class_type: "CLIPVisionEncode", inputs: { clip_vision: ["4", 0], image: ["5", 0] }},
        "7": { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: IPADAPTER_FLUX }},
        "8": { class_type: "IPAdapterAdvanced", inputs: {
          ipadapter: ["7", 0], clip_vision: ["4", 0], image: ["5", 0],
          model: ["1", 0], weight: 0.6, weight_type: "linear",
          start_at: 0.0, end_at: 0.8, combine_embeds: "concat",
        }},
        "9": { class_type: "CLIPTextEncodeFlux", inputs: {
          clip: ["2", 0], clip_l: prompt.slice(0, 77), t5xxl: prompt, guidance: isDev ? 3.5 : 1.0,
        }},
        "10": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: "" }},
        "11": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 }},
        "12": { class_type: "KSampler", inputs: {
          model: ["8", 0], positive: ["9", 0], negative: ["10", 0],
          latent_image: ["11", 0], seed, steps, cfg: isDev ? 3.5 : 1.0,
          sampler_name: "euler", scheduler: "simple", denoise: 1.0,
        }},
        "13": { class_type: "VAEDecode", inputs: { vae: ["3", 0], samples: ["12", 0] }},
        "14": { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["13", 0] }},
      };
    }
    return buildFluxSchnellWorkflow(prompt, seed, width, height, loras, modelOverride);
  }

  if (steps < 15) steps = 25;
  const prefix = `studio/${Date.now()}`;

  if (useIPAdapter) {
    const nodes: Record<string, unknown> = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: {
        ckpt_name: getModelName("t2v", modelOverride),
      }},
      "10": { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: IPADAPTER_SDXL }},
      "11": { class_type: "CLIPVisionLoader", inputs: { clip_name: CLIP_VISION_SDXL }},
      "12": { class_type: "LoadImage", inputs: { image: baseImageName }},
    };

    // LoRAs applied before IPAdapter
    const { modelRef, clipRef } = addLoraChain(nodes, ["1", 0], ["1", 1], loras ?? []);

    return Object.assign(nodes, {
      "13": { class_type: "IPAdapterAdvanced", inputs: {
        ipadapter: ["10", 0], clip_vision: ["11", 0], image: ["12", 0],
        model: modelRef, weight: 0.4, weight_type: "linear",
        start_at: 0.0, end_at: 0.8, combine_embeds: "concat",
      }},
      "2": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: prompt }},
      "3": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: NEG_PROMPT }},
      "4": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 }},
      "5": { class_type: "KSampler", inputs: {
        model: ["13", 0], positive: ["2", 0], negative: ["3", 0],
        latent_image: ["4", 0], seed, steps, cfg: getCfg(modelOverride),
        sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1.0,
      }},
      "6": { class_type: "VAEDecode", inputs: { vae: ["1", 2], samples: ["5", 0] }},
      "7": { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["6", 0] }},
    });
  }

  // Fallback: img2img with high denoise
  const nodes: Record<string, unknown> = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: {
      ckpt_name: getModelName("t2v", modelOverride),
    }},
    "4": { class_type: "LoadImage", inputs: { image: baseImageName }},
    "5": { class_type: "ImageScale", inputs: {
      image: ["4", 0], width, height, upscale_method: "lanczos", crop: "center",
    }},
    "6": { class_type: "VAEEncode", inputs: { vae: ["1", 2], pixels: ["5", 0] }},
  };

  const { modelRef, clipRef } = addLoraChain(nodes, ["1", 0], ["1", 1], loras ?? []);

  return Object.assign(nodes, {
    "2": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: prompt }},
    "3": { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: NEG_PROMPT }},
    "7": { class_type: "KSampler", inputs: {
      model: modelRef, positive: ["2", 0], negative: ["3", 0],
      latent_image: ["6", 0], seed, steps, cfg: getCfg(modelOverride),
      sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 0.85,
    }},
    "8": { class_type: "VAEDecode", inputs: { vae: ["1", 2], samples: ["7", 0] }},
    "9": { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["8", 0] }},
  });
}

// ══════════════════════════════════════════════════════════════════════
// WORKFLOW 3: Image-to-Image variation  (bigLust_v16 · high-denoise img2img)
// Video generation is not available on this server. Instead produces a
// stylised variation of the input image at higher denoise for more change.
// numFrames param kept for API compatibility (ignored).
// ══════════════════════════════════════════════════════════════════════
export function buildI2VWorkflow(
  prompt: string, imageName: string, seed: number, numFrames = 81, modelOverride?: string | null
) {
  void numFrames; // video not supported on this server — returns still image
  const prefix = `studio/variation_${Date.now()}`;
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: {
      ckpt_name: getModelName("t2v", modelOverride),
    }},
    "2": { class_type: "CLIPTextEncode", inputs: {
      clip: ["1", 1], text: prompt,
    }},
    "3": { class_type: "CLIPTextEncode", inputs: {
      clip: ["1", 1], text: NEG_PROMPT,
    }},
    "4": { class_type: "LoadImage", inputs: { image: imageName }},
    "5": { class_type: "ImageScale", inputs: {
      image: ["4", 0], width: 1024, height: 1024,
      upscale_method: "lanczos", crop: "center",
    }},
    "6": { class_type: "VAEEncode", inputs: {
      vae: ["1", 2], pixels: ["5", 0],
    }},
    // Higher denoise (0.85) = more creative variation while keeping subject
    "7": { class_type: "KSampler", inputs: {
      model: ["1", 0], positive: ["2", 0], negative: ["3", 0],
      latent_image: ["6", 0], seed, steps: 30, cfg: getCfg(modelOverride),
      sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 0.85,
    }},
    "8": { class_type: "VAEDecode", inputs: {
      vae: ["1", 2], samples: ["7", 0],
    }},
    "9": { class_type: "SaveImage", inputs: {
      filename_prefix: prefix, images: ["8", 0],
    }},
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── Video quality presets ─────────────────────────────────────────────
export type VideoQualityPreset = "fast" | "balanced" | "smooth";

export const VIDEO_QUALITY_PRESETS: Record<VideoQualityPreset, {
  label: string;
  description: string;
  fps: number;
  maxFrames: number;
  steps: number;
}> = {
  fast: {
    label: "Fast",
    description: "16fps · 4s · 20 steps — quick preview",
    fps: 16,
    maxFrames: 65,
    steps: 20,
  },
  balanced: {
    label: "Balanced",
    description: "24fps · 4s · 25 steps — good quality",
    fps: 24,
    maxFrames: 97,
    steps: 25,
  },
  smooth: {
    label: "Smooth",
    description: "24fps · 4s · 30 steps — best quality",
    fps: 24,
    maxFrames: 97,
    steps: 30,
  },
};

// WORKFLOW 4b: Wan 2.1 I2V 14B — true image-to-video
// Requires wan2.1-i2v-14b-480p-fp8.safetensors in diffusion_models/
// ══════════════════════════════════════════════════════════════════════
export function buildWan2_1_I2VWorkflow_14B(
  prompt: string,
  imageName: string,
  seed: number,
  durationFrames: number = 81,
  preset: VideoQualityPreset = "balanced",
) {
  const prefix = `studio/wan2i2v_${Date.now()}`;
  const { fps: FPS, maxFrames, steps } = VIDEO_QUALITY_PRESETS[preset];
  const clampedFrames = Math.min(durationFrames, maxFrames);
  const frames = Math.max(5, Math.round((clampedFrames - 1) / 4) * 4 + 1);

  return {
    "1": {
      class_type: "WanVideoModelLoader",
      inputs: {
        model: "wan2.1-i2v-14b-480p-fp8.safetensors",
        base_precision: "bf16",
        quantization: "fp8_e4m3fn",
        load_device: "offload_device",
      },
    },
    "2": {
      class_type: "LoadWanVideoT5TextEncoder",
      inputs: { model_name: "umt5-xxl-fp16.safetensors", precision: "bf16", quantization: "fp8_e4m3fn", load_device: "offload_device" },
    },
    "3": {
      class_type: "WanVideoVAELoader",
      inputs: { model_name: "wan_2.1_vae.safetensors", precision: "bf16", load_device: "offload_device" },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: imageName },
    },
    "5": {
      class_type: "WanVideoTextEncode",
      inputs: {
        positive_prompt: prompt,
        negative_prompt: "static image, no motion, blurry, low quality, worst quality",
        t5: ["2", 0],
        force_offload: false,
        model_to_offload: ["1", 0],
      },
    },
    "6": {
      class_type: "WanVideoImageToVideoEncode",
      inputs: {
        width: 832, height: 480, num_frames: frames,
        noise_aug_strength: 0.0,
        start_latent_strength: 1.0,
        end_latent_strength: 0.0,
        force_offload: false,
        vae: ["3", 0],
        start_image: ["4", 0],
      },
    },
    "7": {
      class_type: "WanVideoSampler",
      inputs: {
        model: ["1", 0], image_embeds: ["6", 0], text_embeds: ["5", 0],
        steps, cfg: 6.0, shift: 5.0, seed, force_offload: false,
        scheduler: "unipc", riflex_freq_index: 0,
      },
    },
    "8": {
      class_type: "WanVideoDecode",
      inputs: { vae: ["3", 0], samples: ["7", 0], enable_vae_tiling: true, tile_x: 272, tile_y: 272, tile_stride_x: 144, tile_stride_y: 128 },
    },
    "9": {
      class_type: "VHS_VideoCombine",
      inputs: { images: ["8", 0], frame_rate: FPS, loop_count: 0, format: "video/h264-mp4", pingpong: false, save_output: true, filename_prefix: prefix },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// WORKFLOW 4: Wan 2.1 Text-to-Video (T2V 1.3B) — fallback when I2V not available
// The T2V 1.3B model does NOT support image conditioning.
// Used when wan2.1-i2v-14b-480p-fp8.safetensors is not downloaded yet.
// ══════════════════════════════════════════════════════════════════════
export function buildWan2_1_I2VWorkflow(
  prompt: string,
  _imageName: string, // kept for API compat — not used by T2V model
  seed: number,
  durationFrames: number = 81, // 81 frames ≈ 3 sec at ~24fps (must be divisible by 4 +1)
  _modelOverride?: string | null
) {
  const prefix = `studio/wan2v_${Date.now()}`;
  // Cap at 97 frames (~6s) and clamp to WanVideo divisibility rule
  const clampedFrames = Math.min(durationFrames, 97);
  const frames = Math.max(5, Math.round((clampedFrames - 1) / 4) * 4 + 1);

  return {
    // 1. Load Wan 2.1 T2V 1.3B model from diffusion_models folder
    "1": {
      class_type: "WanVideoModelLoader",
      inputs: {
        model: "wan2.1-t2v-1.3b-fp16.safetensors",
        base_precision: "fp16",
        quantization: "disabled",
        load_device: "offload_device",
      },
    },
    // 2. Load T5 text encoder
    "2": {
      class_type: "LoadWanVideoT5TextEncoder",
      inputs: {
        model_name: "umt5-xxl-fp16.safetensors",
        precision: "bf16",
        quantization: "disabled",
        load_device: "offload_device",
      },
    },
    // 3. Load VAE
    "3": {
      class_type: "WanVideoVAELoader",
      inputs: {
        model_name: "wan_2.1_vae.safetensors",
        precision: "bf16",
        load_device: "offload_device",
      },
    },
    // 4. Encode text prompt via T5
    "4": {
      class_type: "WanVideoTextEncode",
      inputs: {
        positive_prompt: prompt,
        negative_prompt: "static image, no motion, blurry, low quality, worst quality",
        t5: ["2", 0],
        force_offload: false,
        model_to_offload: ["1", 0],
      },
    },
    // 5. Empty image embeds — T2V model, no image conditioning
    "5": {
      class_type: "WanVideoEmptyEmbeds",
      inputs: {
        width: 832,
        height: 480,
        num_frames: frames,
      },
    },
    // 6. Sample video latents
    "6": {
      class_type: "WanVideoSampler",
      inputs: {
        model: ["1", 0],
        image_embeds: ["5", 0],
        text_embeds: ["4", 0],
        steps: 15,
        cfg: 6.0,
        shift: 5.0,
        seed,
        force_offload: false,
        scheduler: "unipc",
        riflex_freq_index: 0,
      },
    },
    // 7. Decode latents to video frames
    "7": {
      class_type: "WanVideoDecode",
      inputs: {
        vae: ["3", 0],
        samples: ["6", 0],
        enable_vae_tiling: true,
        tile_x: 272,
        tile_y: 272,
        tile_stride_x: 144,
        tile_stride_y: 128,
      },
    },
    // 8. Combine frames into MP4 video
    "8": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["7", 0],
        frame_rate: 16,
        loop_count: 0,
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
        filename_prefix: prefix,
      },
    },
  };
}
