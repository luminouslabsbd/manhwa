/**
 * Workflow registry — maps `Model.workflow_id` to a builder function that
 * produces a ComfyUI prompt graph (or a provider request payload for TTS/LLM).
 *
 * Why a registry: `Model` rows in the DB are arbitrary catalog entries admins
 * can add. Each row points at a `workflow_id` which must resolve to code that
 * knows how to render using whatever weights that model ships. Adding a new
 * model with an existing architecture (e.g. another SDXL variant) is a pure
 * DB insert — no code change. Adding a brand-new architecture requires adding
 * a new entry here.
 */

import {
  buildLTX2_I2VWorkflow,
  buildI2VWorkflow,
  buildFluxSchnellWorkflow,
  buildFluxWorkflow,
  buildImageWorkflow,
  type VideoQualityPreset,
  type LoraSpec,
} from "@/lib/comfyui";

// ── Builder input shapes (one per category) ────────────────────────────────

export interface VideoBuilderArgs {
  prompt: string;
  imageName: string;
  seed: number;
  frames: number;
  /** Model.default_params, merged with any per-call overrides. */
  params: Record<string, unknown>;
  /** Legacy preset knob (fast/balanced/smooth) — respected by LTX builders. */
  preset?: VideoQualityPreset;
  /** Fallback checkpoint for SDXL img2img — resolved by caller. */
  fallbackCheckpoint?: string;
}

export interface ImageBuilderArgs {
  prompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
  /** Model.default_params, merged with per-call overrides. */
  params: Record<string, unknown>;
  loras?: LoraSpec[];
  /** Specific checkpoint override (e.g. per-project pipeline_model). */
  modelOverride?: string | null;
}

type ComfyWorkflow = Record<string, unknown>;
type VideoBuilder = (args: VideoBuilderArgs) => ComfyWorkflow;
type ImageBuilder = (args: ImageBuilderArgs) => ComfyWorkflow;

/** Thrown when a Model row points at a workflow_id that has no builder. */
export class UnknownWorkflowError extends Error {
  constructor(workflowId: string) {
    super(`No builder registered for workflow_id="${workflowId}". Either the Model row is mis-seeded or the workflow code is missing.`);
    this.name = "UnknownWorkflowError";
  }
}

/** Thrown by builders whose model is catalogued but not yet installed on the pod. */
export class ModelNotInstalledError extends Error {
  constructor(modelLabel: string) {
    super(`Model "${modelLabel}" is catalogued but not installed on the current pod. Provision a pod that includes this model and point videoHost at it.`);
    this.name = "ModelNotInstalledError";
  }
}

// ── Video builders ─────────────────────────────────────────────────────────

const videoBuilders: Record<string, VideoBuilder> = {
  // LTX-Video 2 — both full and distilled variants use the same builder.
  // `params.ckpt` picks the safetensors file (distilled or dev/full); steps
  // and cfg differ between variants and come in via `default_params`.
  ltx2_i2v: ({ prompt, imageName, seed, frames, params, preset }) => {
    const preset_ = preset ?? "balanced";
    const ckpt = typeof params.ckpt === "string" ? params.ckpt : undefined;
    const steps = typeof params.steps === "number" ? params.steps : undefined;
    const cfg = typeof params.cfg === "number" ? params.cfg : undefined;
    return buildLTX2_I2VWorkflow(prompt, imageName, seed, frames, preset_, ckpt, steps, cfg);
  },

  // SDXL img2img used as the universal video fallback when no video model
  // is installed on the pod. Produces a still (the builder ignores `frames`).
  sdxl_img2img: ({ prompt, imageName, seed, frames, fallbackCheckpoint }) => {
    return buildI2VWorkflow(prompt, imageName, seed, frames, fallbackCheckpoint ?? null);
  },

  // Kijai's ComfyUI-WanVideoWrapper. The install_script (in the catalog row)
  // clones the node repo and downloads the fp8 UNet + T5 encoder + VAE into
  // /workspace/models/. Graph shape below is adapted from the wrapper's
  // example_workflows/ i2v templates — tune nodes once you've run it on a pod.
  wan2_i2v: ({ prompt, imageName, seed, frames, params }) => {
    const ckpt  = typeof params.ckpt   === "string" ? params.ckpt   : "Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors";
    const vae   = typeof params.vae    === "string" ? params.vae    : "Wan2_1_VAE_bf16.safetensors";
    const t5    = typeof params.t5     === "string" ? params.t5     : "umt5-xxl-enc-bf16.safetensors";
    const steps = typeof params.steps  === "number" ? params.steps  : 20;
    const cfg   = typeof params.cfg    === "number" ? params.cfg    : 6.0;
    const width = typeof params.width  === "number" ? params.width  : 832;
    const height= typeof params.height === "number" ? params.height : 480;
    const wanFrames = Math.max(9, frames);

    return {
      "1": { class_type: "WanVideoModelLoader", inputs: { model: ckpt, base_precision: "fp8_e4m3fn", quantization: "disabled", attention_mode: "sageattn", load_device: "main_device" } },
      "2": { class_type: "WanVideoVAELoader", inputs: { model_name: vae, precision: "bf16" } },
      "3": { class_type: "LoadWanVideoT5TextEncoder", inputs: { model_name: t5, precision: "bf16", load_device: "offload_device" } },
      "4": { class_type: "LoadImage", inputs: { image: imageName } },
      "5": { class_type: "WanVideoTextEncode", inputs: { t5: ["3", 0], positive_prompt: prompt, negative_prompt: "low quality, blurry, distorted" } },
      "6": { class_type: "WanVideoImageToVideoEncode", inputs: { vae: ["2", 0], image: ["4", 0], width, height, num_frames: wanFrames } },
      "7": { class_type: "WanVideoSampler", inputs: { model: ["1", 0], text_embeds: ["5", 0], image_embeds: ["6", 0], steps, cfg, seed, scheduler: "unipc", shift: 5.0 } },
      "8": { class_type: "WanVideoDecode", inputs: { vae: ["2", 0], samples: ["7", 0], enable_vae_tiling: true } },
      "9": { class_type: "VHS_VideoCombine", inputs: { images: ["8", 0], frame_rate: 16, filename_prefix: `studio/wan2_${Date.now()}`, format: "video/h264-mp4", pix_fmt: "yuv420p", crf: 19 } },
    } as Record<string, unknown>;
  },

  // Kijai's ComfyUI-CogVideoXWrapper. Same pattern as Wan: install_script
  // clones the node + weights; graph uses the wrapper's node names.
  cog_i2v: ({ prompt, imageName, seed, frames, params }) => {
    const ckpt   = typeof params.ckpt   === "string" ? params.ckpt   : "CogVideoX1_5-5B-I2V";
    const steps  = typeof params.steps  === "number" ? params.steps  : 50;
    const cfg    = typeof params.cfg    === "number" ? params.cfg    : 6.0;
    const width  = typeof params.width  === "number" ? params.width  : 768;
    const height = typeof params.height === "number" ? params.height : 512;

    return {
      "1": { class_type: "DownloadAndLoadCogVideoModel", inputs: { model: ckpt, precision: "bf16", quantization: "disabled", enable_sequential_cpu_offload: false, attention_mode: "sageattn", load_device: "main_device" } },
      "2": { class_type: "LoadImage", inputs: { image: imageName } },
      "3": { class_type: "CogVideoTextEncode", inputs: { pipeline: ["1", 0], prompt, force_offload: true } },
      "4": { class_type: "CogVideoTextEncode", inputs: { pipeline: ["1", 0], prompt: "low quality, blurry, distorted", force_offload: true } },
      "5": { class_type: "CogVideoImageEncode", inputs: { pipeline: ["1", 0], image: ["2", 0], chunk_size: 4, enable_tiling: true } },
      "6": { class_type: "CogVideoSampler", inputs: { pipeline: ["1", 0], positive: ["3", 0], negative: ["4", 0], samples: ["5", 0], num_frames: frames, steps, cfg, seed, scheduler: "CogVideoXDDIM", width, height } },
      "7": { class_type: "CogVideoDecode", inputs: { pipeline: ["1", 0], samples: ["6", 0], enable_vae_tiling: true } },
      "8": { class_type: "VHS_VideoCombine", inputs: { images: ["7", 0], frame_rate: 8, filename_prefix: `studio/cog_${Date.now()}`, format: "video/h264-mp4", pix_fmt: "yuv420p", crf: 19 } },
    } as Record<string, unknown>;
  },
};

// ── Image builders ─────────────────────────────────────────────────────────

const imageBuilders: Record<string, ImageBuilder> = {
  // Flux Schnell — 4-step turbo.
  flux_schnell: ({ prompt, seed, width, height, loras, modelOverride }) => {
    return buildFluxSchnellWorkflow(prompt, seed, width, height, loras, modelOverride);
  },

  // Flux Dev / custom Flux UNET checkpoints.
  flux_dev: ({ prompt, seed, width, height, steps, loras, modelOverride }) => {
    return buildFluxWorkflow(prompt, seed, width, height, steps, modelOverride, loras);
  },

  // SDXL family (base, juggernaut, animagine, etc.) — all share the same
  // checkpoint-loader workflow; the Model's `id` maps to a .safetensors on
  // the pod and is passed via modelOverride from the dispatcher.
  sdxl_base: ({ prompt, seed, width, height, steps, loras, modelOverride }) => {
    return buildImageWorkflow(prompt, seed, width, height, steps, modelOverride, loras);
  },
};

// ── Public API ─────────────────────────────────────────────────────────────

/** Looks up a video workflow builder by `workflow_id` (from Model row). */
export function getVideoBuilder(workflowId: string): VideoBuilder {
  const builder = videoBuilders[workflowId];
  if (!builder) throw new UnknownWorkflowError(workflowId);
  return builder;
}

/** Looks up an image workflow builder by `workflow_id`. */
export function getImageBuilder(workflowId: string): ImageBuilder {
  const builder = imageBuilders[workflowId];
  if (!builder) throw new UnknownWorkflowError(workflowId);
  return builder;
}

/** IDs known for each category — useful for admin UI validation. */
export const REGISTERED_WORKFLOW_IDS = {
  video: Object.keys(videoBuilders),
  image: Object.keys(imageBuilders),
} as const;
