-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "style_guide" TEXT,
    "style_guide_filename" TEXT,
    "storyboard_filename" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "base_image_path" TEXT,
    "base_image_comfyui" TEXT,
    "base_image_prompt" TEXT,
    "base_image_seed" INTEGER,
    "pipeline_model" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shots" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "shot_number" INTEGER NOT NULL,
    "character" TEXT,
    "shot_description" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "lighting" TEXT NOT NULL,
    "camera_angle" TEXT NOT NULL,
    "full_prompt" TEXT NOT NULL,
    "negative_prompt" TEXT NOT NULL,
    "seed" INTEGER,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "steps" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "approved_image_id" TEXT,
    "approved_image_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approved_video_id" TEXT,
    "approved_tts_id" TEXT,
    "created_at" TEXT NOT NULL,
    "story_line" TEXT,
    "dialogue" TEXT,
    "anchor" TEXT,
    "audio_path" TEXT,
    "video_audio_path" TEXT,

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "comfyui_prompt_id" TEXT,
    "status" TEXT NOT NULL,
    "seed" INTEGER,
    "image_path" TEXT,
    "video_path" TEXT,
    "audio_path" TEXT,
    "voice" TEXT,
    "error" TEXT,
    "created_at" TEXT NOT NULL,
    "completed_at" TEXT,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "appearance" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reference_prompt" TEXT NOT NULL,
    "reference_image" TEXT,
    "seed" INTEGER,
    "status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "pipeline_model" TEXT,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_settings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "content_provider" JSONB NOT NULL,
    "image_provider" JSONB NOT NULL,
    "video_provider" JSONB NOT NULL,
    "openai_api_key" TEXT NOT NULL,
    "anthropic_api_key" TEXT NOT NULL,
    "ollama_host" TEXT NOT NULL,
    "comfyui_host" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "art_style" TEXT NOT NULL,
    "quality_tags" TEXT NOT NULL,
    "negative_prompt" TEXT NOT NULL,
    "environment_preset" TEXT NOT NULL,
    "lighting_preset" TEXT NOT NULL,
    "camera_presets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color_palette" TEXT NOT NULL,
    "custom_prefix" TEXT NOT NULL,
    "custom_suffix" TEXT NOT NULL,
    "video_prompt_template" TEXT NOT NULL,
    "tts_default_voice" TEXT NOT NULL,
    "tts_character_voices" JSONB NOT NULL,
    "tts_speed" DOUBLE PRECISION NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "prompt_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_settings_project_id_key" ON "prompt_settings"("project_id");
