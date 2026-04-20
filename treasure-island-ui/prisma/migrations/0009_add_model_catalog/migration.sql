-- ── AppConfig: add per-category active-model columns ───────────────────────
ALTER TABLE "app_config"
  ADD COLUMN IF NOT EXISTS "active_image_model"   TEXT NOT NULL DEFAULT 'flux-schnell',
  ADD COLUMN IF NOT EXISTS "active_video_model"   TEXT NOT NULL DEFAULT 'ltx2-distilled',
  ADD COLUMN IF NOT EXISTS "active_tts_model"     TEXT NOT NULL DEFAULT 'xtts-v2',
  ADD COLUMN IF NOT EXISTS "active_content_model" TEXT NOT NULL DEFAULT 'qwen2.5-7b';

-- Backfill active_video_model from existing video_model values.
-- "ltx2" (legacy) → "ltx2-distilled" (new catalog slug).
UPDATE "app_config"
   SET "active_video_model" = CASE
     WHEN "video_model" = 'ltx2' THEN 'ltx2-distilled'
     WHEN "video_model" = 'wan2' THEN 'wan2-i2v-14b'
     ELSE "video_model"
   END
 WHERE "id" = 'default';

-- ── Model catalog ──────────────────────────────────────────────────────────
CREATE TABLE "models" (
    "id"             TEXT    NOT NULL,
    "category"       TEXT    NOT NULL,
    "label"          TEXT    NOT NULL,
    "description"    TEXT    NOT NULL DEFAULT '',
    "workflow_id"    TEXT    NOT NULL,
    "install_script" TEXT    NOT NULL DEFAULT '',
    "default_params" JSONB   NOT NULL DEFAULT '{}',
    "vram_gb"        INTEGER NOT NULL DEFAULT 16,
    "disk_gb"        INTEGER NOT NULL DEFAULT 10,
    "is_enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
    "is_default"     BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at"     TEXT    NOT NULL,
    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "models_category_is_enabled_idx" ON "models"("category", "is_enabled");

-- ── Seed rows — current lineup ─────────────────────────────────────────────

-- Video: LTX-Video 2 (the two variants currently used on pods)
INSERT INTO "models" ("id","category","label","description","workflow_id","default_params","vram_gb","disk_gb","is_default","created_at") VALUES
  ('ltx2-distilled','video','LTX-Video 2 Distilled',
   'Lightricks 13B 0.9.7 step-distilled — ~8 steps, cfg 1.0. Fast I2V.',
   'ltx2_i2v',
   '{"steps":8,"cfg":1.0,"width":768,"height":512,"frames":97,"fps":24}'::jsonb,
   24, 37, TRUE, NOW()::text),
  ('ltx2-full','video','LTX-Video 2 (Full)',
   'Lightricks 13B 0.9.7 full precision — 20 steps. Higher quality, slower.',
   'ltx2_i2v',
   '{"steps":20,"cfg":3.0,"width":768,"height":512,"frames":97,"fps":24}'::jsonb,
   24, 37, FALSE, NOW()::text),
  ('wan2-i2v-14b','video','Wan 2.1 I2V 14B',
   'Alibaba Wan 2.1 image-to-video 14B (fp8). High quality but slow — ~8 min per clip on L40S.',
   'wan2_i2v',
   '{"steps":20,"cfg":6.0,"width":832,"height":480,"frames":81,"fps":24}'::jsonb,
   48, 27, FALSE, NOW()::text),
  ('cogvideox-5b-i2v','video','CogVideoX 1.5 5B I2V',
   'THUDM CogVideoX 1.5 5B I2V (bf16). Fits on 24GB+ cards, ~1-2 min/clip.',
   'cog_i2v',
   '{"steps":50,"cfg":6.0,"width":768,"height":512,"frames":49,"fps":8}'::jsonb,
   24, 11, FALSE, NOW()::text),
  ('sdxl-img2vid-fallback','video','SDXL img2img (fallback)',
   'SDXL image-to-image last-resort video workflow. Used when no video model is installed.',
   'sdxl_img2img',
   '{"steps":20,"cfg":7.0,"frames":24}'::jsonb,
   8, 0, FALSE, NOW()::text);

-- Image: Flux Schnell + SDXL family
INSERT INTO "models" ("id","category","label","description","workflow_id","default_params","vram_gb","disk_gb","is_default","created_at") VALUES
  ('flux-schnell','image','FLUX.1 Schnell',
   'Black Forest Labs 12B turbo — 4 steps, cfg 1.0. Photorealistic & coherent.',
   'flux_schnell',
   '{"steps":4,"cfg":1.0,"width":1024,"height":1024}'::jsonb,
   24, 20, TRUE, NOW()::text),
  ('sdxl-base','image','SDXL Base',
   'Stable Diffusion XL base 1.0 — anchor model for the SDXL family.',
   'sdxl_base',
   '{"steps":30,"cfg":7.0,"width":1024,"height":1024}'::jsonb,
   8, 7, FALSE, NOW()::text),
  ('sdxl-juggernaut','image','SDXL Juggernaut XL',
   'Juggernaut XL — realistic style, strong prompt following.',
   'sdxl_base',
   '{"steps":30,"cfg":9.0,"width":1024,"height":1024}'::jsonb,
   8, 7, FALSE, NOW()::text),
  ('sdxl-animagine','image','SDXL Animagine XL',
   'Animagine XL — anime / manhwa style.',
   'sdxl_base',
   '{"steps":30,"cfg":7.5,"width":1024,"height":1024}'::jsonb,
   8, 7, FALSE, NOW()::text);

-- TTS
INSERT INTO "models" ("id","category","label","description","workflow_id","default_params","vram_gb","disk_gb","is_default","created_at") VALUES
  ('xtts-v2','tts','Coqui XTTS v2',
   'Multilingual voice-cloning TTS (including Bengali). Runs as a Flask service on the pod.',
   'xtts_v2',
   '{"sampleRate":24000}'::jsonb,
   6, 5, TRUE, NOW()::text),
  ('mms-tts-bengali','tts','Meta MMS (Bengali)',
   'facebook/mms-tts-ben — native Bengali TTS, no speaker reference needed.',
   'mms_tts',
   '{"language":"ben","sampleRate":16000}'::jsonb,
   2, 1, FALSE, NOW()::text),
  ('edge-tts','tts','Edge TTS',
   'Microsoft Edge TTS service — light, CPU only, many voices but no cloning.',
   'edge_tts',
   '{"voice":"en-US-JennyNeural"}'::jsonb,
   0, 0, FALSE, NOW()::text);

-- Content (LLMs served via Ollama on the pod)
INSERT INTO "models" ("id","category","label","description","workflow_id","default_params","vram_gb","disk_gb","is_default","created_at") VALUES
  ('qwen2.5-7b','content','Qwen 2.5 7B',
   'Alibaba Qwen 2.5 7B — default prompt / story generator.',
   'ollama',
   '{"model":"qwen2.5:7b","temperature":0.7}'::jsonb,
   8, 5, TRUE, NOW()::text),
  ('gemma-3-12b','content','Gemma 3 12B',
   'Google Gemma 3 12B — higher quality LLM for story and prompt generation.',
   'ollama',
   '{"model":"gemma3:12b","temperature":0.7}'::jsonb,
   12, 8, FALSE, NOW()::text),
  ('llama3.1-8b','content','Llama 3.1 8B',
   'Meta Llama 3.1 8B Instruct — balanced quality/speed.',
   'ollama',
   '{"model":"llama3.1:8b","temperature":0.7}'::jsonb,
   8, 5, FALSE, NOW()::text);
