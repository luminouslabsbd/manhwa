/**
 * Translate a list of catalog Model IDs from the pod-create wizard into the
 * legacy INSTALL_SDXL / INSTALL_FLUX / INSTALL_VIDEO booleans that
 * scripts/pod-setup.sh has hardcoded download blocks for, plus a remaining
 * extra-install script for any catalog row that doesn't map to a canonical
 * preset.
 *
 * Why translate at all (rather than fully data-driving pod-setup.sh): the
 * canonical models have battle-tested install steps in the shell script —
 * parallel hf_download calls, civitai fallback, retries, sha verification.
 * Replacing those wholesale would be a much riskier change. This shim lets
 * admins add new catalog variants (e.g. flux-schnell with different params,
 * or a brand-new sdxl checkpoint) without re-touching the shell script for
 * the common case, while still allowing fully custom installers via the
 * EXTRA_INSTALL_SCRIPT hook for non-canonical models.
 */

import type { PodComponents } from "@/lib/runpod";

export type SelectedModelMeta = {
  id: string;
  category: "image" | "video" | "tts" | "content";
  install_script: string;
};

const CANONICAL_SDXL_IDS = new Set(["sdxl-base", "sdxl-juggernaut", "sdxl-animagine"]);
const CANONICAL_FLUX_IDS = new Set(["flux-schnell"]);
// LTX bundles + the SDXL fallback all rely on INSTALL_VIDEO=1's downloads,
// since they share the same checkpoint family on the pod.
const CANONICAL_VIDEO_IDS = new Set(["ltx2-distilled", "ltx2-full", "sdxl-img2vid-fallback"]);

/**
 * TTS engines understood by scripts/pod-setup.sh. Pick the one matching the
 * selected catalog `tts` model id; fallback is edge-tts (the old default).
 */
export type TtsEngine = "edge-tts" | "xtts-v2" | "mms-tts-bengali" | "whisperspeech";

const TTS_ENGINE_BY_ID: Record<string, TtsEngine> = {
  "edge-tts":        "edge-tts",
  "xtts-v2":         "xtts-v2",
  "mms-tts-bengali": "mms-tts-bengali",
  "whisperspeech":   "whisperspeech",
};

export interface TranslationResult {
  components: PodComponents;
  extraInstallScript: string;
  /** Models with a non-empty install_script that didn't match any canonical preset. */
  customModelIds: string[];
  /**
   * First TTS backend chosen (for the legacy singular `ttsEngine` slot on
   * CreatePodInput). Equals `ttsEngines[0]` when any tts model was selected.
   */
  ttsEngine?: TtsEngine;
  /**
   * Every TTS engine implied by the selected tts-category models. Multiple
   * engines coexist on the pod — each on its own port — so the user can
   * A/B compare. Empty when no tts model was picked.
   */
  ttsEngines: TtsEngine[];
}

export function translateSelection(
  models: SelectedModelMeta[],
): TranslationResult {
  const components: PodComponents = {
    comfyui: false, tts: false, ollama: false, sdxl: false, flux: false, video: false,
  };
  const customScripts: string[] = [];
  const customIds: string[] = [];
  const ttsEngineSet = new Set<TtsEngine>();

  for (const m of models) {
    // Category-level toggles: any TTS model implies the TTS service runs;
    // any content model implies Ollama runs. ComfyUI gets auto-enabled by
    // runpod.ts when sdxl/flux/video is set.
    if (m.category === "tts") {
      components.tts = true;
      // Accumulate — pod-setup.sh now installs every engine in TTS_ENGINES
      // (plural), each on its own port, so multiple selections all land.
      const engine = TTS_ENGINE_BY_ID[m.id];
      if (engine) ttsEngineSet.add(engine);
    }
    if (m.category === "content") components.ollama = true;

    if (m.category === "image") {
      if (CANONICAL_SDXL_IDS.has(m.id)) components.sdxl = true;
      else if (CANONICAL_FLUX_IDS.has(m.id)) components.flux = true;
      else if (m.install_script.trim()) {
        customScripts.push(`# --- ${m.id} (image) ---\n${m.install_script}`);
        customIds.push(m.id);
      }
    } else if (m.category === "video") {
      if (CANONICAL_VIDEO_IDS.has(m.id)) components.video = true;
      else if (m.install_script.trim()) {
        customScripts.push(`# --- ${m.id} (video) ---\n${m.install_script}`);
        customIds.push(m.id);
      }
    } else if (m.install_script.trim()) {
      // tts/content with custom install_script (e.g. an MMS-only pod).
      customScripts.push(`# --- ${m.id} (${m.category}) ---\n${m.install_script}`);
      customIds.push(m.id);
    }
  }

  const ttsEngines = Array.from(ttsEngineSet);
  return {
    components,
    extraInstallScript: customScripts.join("\n\n"),
    customModelIds: customIds,
    ttsEngine: ttsEngines[0],
    ttsEngines,
  };
}
