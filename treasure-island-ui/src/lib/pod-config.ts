import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".pod-config.json");

export interface PodConfig {
  activePodId?: string;
  comfyuiHost?: string;
  ollamaHost?: string;
  ttsHost?: string;
  idleStopEnabled: boolean;
  idleStopMinutes: number;
  lastActivityAt?: string; // ISO timestamp — last time queue had jobs
  lastIdleCheckAt?: string;
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

export function resolveOllamaHost(): string {
  const cfg = getPodConfig();
  return cfg.ollamaHost || process.env.OLLAMA_HOST || "http://localhost:11434";
}

export function resolveTtsHost(): string {
  const cfg = getPodConfig();
  return cfg.ttsHost || process.env.TTS_HOST || "http://localhost:5000";
}
