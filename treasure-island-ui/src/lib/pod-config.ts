import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".pod-config.json");

export type VideoQualityPreset = "fast" | "balanced" | "smooth";

export type PodService = "image" | "video" | "ollama" | "tts";

export interface PodConfig {
  activePodId?: string;
  // comfyuiHost is the ComfyUI proxy used for image generation.
  comfyuiHost?: string;
  // videoHost is a separate ComfyUI proxy used for video workflows (Wan 2.1 etc).
  // Falls back to comfyuiHost when unset, so existing single-pod setups keep working.
  videoHost?: string;
  ollamaHost?: string;
  ttsHost?: string;
  // Per-service pod IDs — let each service point to a different pod.
  activeImagePodId?: string;
  activeVideoPodId?: string;
  activeOllamaPodId?: string;
  activeTtsPodId?: string;
  idleStopEnabled: boolean;
  idleStopMinutes: number;
  lastActivityAt?: string; // ISO timestamp — last time queue had jobs
  lastIdleCheckAt?: string;
  videoQualityPreset?: VideoQualityPreset;
}

const DEFAULTS: PodConfig = {
  idleStopEnabled: false,
  idleStopMinutes: 60,
};

export function getPodConfig(): PodConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePodConfig(updates: Partial<PodConfig>): PodConfig {
  const current = getPodConfig();
  const next = { ...current, ...updates };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

/** Resolves host, checking pod-config.json first then env vars */
export function resolveComfyUIHost(): string {
  const cfg = getPodConfig();
  return cfg.comfyuiHost || process.env.COMFYUI_HOST || "http://localhost:8188";
}

/** Host used for video workflows. Falls back to image host if not set separately. */
export function resolveVideoHost(): string {
  const cfg = getPodConfig();
  return cfg.videoHost || cfg.comfyuiHost || process.env.VIDEO_HOST || process.env.COMFYUI_HOST || "http://localhost:8188";
}

export function resolveOllamaHost(): string {
  const cfg = getPodConfig();
  return cfg.ollamaHost || process.env.OLLAMA_HOST || "http://localhost:11434";
}

export function resolveTtsHost(): string {
  const cfg = getPodConfig();
  return cfg.ttsHost || process.env.TTS_HOST || "http://localhost:5000";
}
