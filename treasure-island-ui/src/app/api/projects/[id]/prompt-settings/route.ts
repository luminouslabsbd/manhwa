import { load, save, PromptSettings } from "@/lib/db";
import { randomUUID } from "crypto";

const DEFAULTS: Omit<PromptSettings, "id" | "project_id" | "created_at"> = {
  content_provider: { provider: "ollama", model: "qwen2.5:3b" },
  image_provider: { provider: "ollama", model: "qwen2.5:3b" },
  video_provider: { provider: "ollama", model: "qwen2.5:3b" },
  openai_api_key: "",
  anthropic_api_key: "",
  ollama_host: "",
  comfyui_host: "",
  mode: "environment",
  art_style: "manhwa",
  quality_tags: "masterpiece, best quality, highly detailed, sharp focus, professional illustration",
  negative_prompt: "blurry, low quality, distorted, deformed, bad anatomy, watermark, text, ugly, duplicate",
  environment_preset: "urban",
  lighting_preset: "cinematic",
  camera_presets: ["close-up", "medium shot", "wide shot", "over-the-shoulder", "low angle", "bird's eye"],
  color_palette: "vibrant",
  custom_prefix: "",
  custom_suffix: "",
  video_prompt_template: "cinematic motion, smooth camera movement, high quality animation, {prompt}",
  tts_default_voice: "default",
  tts_character_voices: {},
  tts_speed: 1.0,
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  let settings = db.prompt_settings.find((s) => s.project_id === id);
  if (!settings) {
    settings = { ...DEFAULTS, id: randomUUID(), project_id: id, created_at: new Date().toISOString() };
    db.prompt_settings.push(settings);
    await save(db);
  } else {
    // Backfill new fields for existing records
    let dirty = false;
    const backfill = DEFAULTS as Record<string, unknown>;
    for (const key of Object.keys(backfill)) {
      if ((settings as Record<string, unknown>)[key] === undefined) {
        (settings as Record<string, unknown>)[key] = backfill[key];
        dirty = true;
      }
    }
    if (dirty) await save(db);
  }
  return Response.json(settings);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const updates = await req.json();
  const db = await load();
  let idx = db.prompt_settings.findIndex((s) => s.project_id === id);
  if (idx === -1) {
    const settings: PromptSettings = { ...DEFAULTS, id: randomUUID(), project_id: id, created_at: new Date().toISOString(), ...updates };
    db.prompt_settings.push(settings);
  } else {
    db.prompt_settings[idx] = { ...db.prompt_settings[idx], ...updates };
  }
  await save(db);
  return Response.json(db.prompt_settings.find((s) => s.project_id === id));
}
