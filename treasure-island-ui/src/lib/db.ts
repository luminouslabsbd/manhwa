import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type Project = {
  id: string; name: string; style_guide: string | null; style_guide_filename: string | null; storyboard_filename: string | null; status: string; created_at: string;
  base_image_path?: string | null;
  base_image_comfyui?: string | null;
  base_image_prompt?: string | null;
  base_image_seed?: number | null;
  pipeline_model?: string | null;
  user_id?: string | null;
};
export type Episode = { id: string; project_id: string; number: number; title: string; summary: string | null; created_at: string };
export type Shot = {
  id: string; episode_id: string; project_id: string; shot_number: number; character: string | null; shot_description: string; environment: string; lighting: string; camera_angle: string; full_prompt: string; negative_prompt: string; seed: number | null; width: number; height: number; steps: number;
  status: string;
  approved_image_id: string | null;
  approved_image_ids?: string[];
  approved_video_id?: string | null;
  approved_tts_id?: string | null;
  created_at: string;
  story_line?: string | null;
  dialogue?: string | null;
  anchor?: string | null;
  audio_path?: string | null;
  video_audio_path?: string | null;
  prompt_template_id?: string | null;
  interaction_type?: string | null;
};
export type Generation = { id: string; shot_id: string; type: string; comfyui_prompt_id: string | null; status: string; seed: number | null; image_path: string | null; video_path: string | null; audio_path?: string | null; voice?: string | null; error: string | null; ref_image?: string | null; created_at: string; completed_at: string | null };
export type Character = { id: string; project_id: string; name: string; description: string; appearance: string; role: string; reference_prompt: string; reference_image: string | null; seed: number | null; status: string; created_at: string; pipeline_model?: string | null };

export type LLMProvider = "ollama" | "claude" | "openai";
export type ProviderConfig = { provider: LLMProvider; model: string };

export type PromptSettings = {
  id: string; project_id: string;
  content_provider: ProviderConfig;
  image_provider: ProviderConfig;
  video_provider: ProviderConfig;
  openai_api_key: string; anthropic_api_key: string; ollama_host: string; comfyui_host: string;
  mode: "document" | "environment" | "custom" | "random";
  art_style: string; quality_tags: string; negative_prompt: string; environment_preset: string; lighting_preset: string; camera_presets: string[]; color_palette: string; custom_prefix: string; custom_suffix: string; video_prompt_template: string;
  tts_default_voice: string; tts_character_voices: Record<string, string>; tts_speed: number;
  created_at: string;
};

// Queue is now in Redis (BullMQ) — kept for type compat
export type QueueItem = {
  shot_id: string; project_id: string; model: string; seed: number;
  loras?: { name: string; strength: number }[];
  added_at: string;
};

type DB = { projects: Project[]; episodes: Episode[]; shots: Shot[]; generations: Generation[]; characters: Character[]; prompt_settings: PromptSettings[]; queue: QueueItem[] };

/** Load all data. Pass userId to scope to a single user's projects. */
export async function load(userId?: string): Promise<DB> {
  const projects = await prisma.project.findMany(
    userId ? { where: { user_id: userId } } : undefined
  );
  const projectIds = projects.map((p) => p.id);

  const [episodes, shots, generations, characters, promptSettings] = await Promise.all([
    projectIds.length > 0
      ? prisma.episode.findMany({ where: { project_id: { in: projectIds } } })
      : [],
    projectIds.length > 0
      ? prisma.shot.findMany({ where: { project_id: { in: projectIds } } })
      : [],
    (async () => {
      if (projectIds.length === 0) return [];
      const shotIds = (await prisma.shot.findMany({ where: { project_id: { in: projectIds } }, select: { id: true } })).map((s) => s.id);
      return shotIds.length > 0 ? prisma.generation.findMany({ where: { shot_id: { in: shotIds } } }) : [];
    })(),
    projectIds.length > 0
      ? prisma.character.findMany({ where: { project_id: { in: projectIds } } })
      : [],
    projectIds.length > 0
      ? prisma.promptSettings.findMany({ where: { project_id: { in: projectIds } } })
      : [],
  ]);

  return {
    projects: projects as Project[],
    episodes: episodes as Episode[],
    shots: shots.map(s => ({ ...s, approved_image_ids: s.approved_image_ids ?? [] })) as Shot[],
    generations: generations as Generation[],
    characters: characters as Character[],
    prompt_settings: promptSettings.map(ps => ({
      ...ps,
      content_provider: ps.content_provider as ProviderConfig,
      image_provider: ps.image_provider as ProviderConfig,
      video_provider: ps.video_provider as ProviderConfig,
      tts_character_voices: ps.tts_character_voices as Record<string, string>,
    })) as PromptSettings[],
    queue: [], // queue lives in Redis
  };
}

export async function save(db: DB, userId?: string): Promise<void> {
  const projectIds = db.projects.map(p => p.id);
  const episodeIds = db.episodes.map(e => e.id);
  const shotIds = db.shots.map(s => s.id);
  const generationIds = db.generations.map(g => g.id);
  const characterIds = db.characters.map(c => c.id);
  const psIds = db.prompt_settings.map(ps => ps.id);

  await prisma.$transaction(async (tx) => {
    // Upsert all entities
    for (const p of db.projects) {
      await tx.project.upsert({ where: { id: p.id }, create: p, update: p });
    }
    for (const e of db.episodes) {
      await tx.episode.upsert({ where: { id: e.id }, create: e, update: e });
    }
    for (const s of db.shots) {
      const data = { ...s, approved_image_ids: s.approved_image_ids ?? [] };
      await tx.shot.upsert({ where: { id: s.id }, create: data, update: data });
    }
    for (const g of db.generations) {
      await tx.generation.upsert({ where: { id: g.id }, create: g, update: g });
    }
    for (const c of db.characters) {
      await tx.character.upsert({ where: { id: c.id }, create: c, update: c });
    }
    for (const ps of db.prompt_settings) {
      const data = {
        ...ps,
        content_provider: ps.content_provider as Prisma.InputJsonValue,
        image_provider: ps.image_provider as Prisma.InputJsonValue,
        video_provider: ps.video_provider as Prisma.InputJsonValue,
        tts_character_voices: ps.tts_character_voices as Prisma.InputJsonValue,
      };
      await tx.promptSettings.upsert({ where: { id: ps.id }, create: data, update: data });
    }

    // Delete orphans scoped to the current user's projects to avoid cross-user deletion
    if (projectIds.length > 0) {
      const orphanWhere = userId
        ? { id: { notIn: projectIds }, user_id: userId }
        : { id: { notIn: projectIds } };
      await tx.project.deleteMany({ where: orphanWhere });
    }
    if (episodeIds.length > 0) {
      await tx.episode.deleteMany({ where: { id: { notIn: episodeIds }, project_id: { in: projectIds.length > 0 ? projectIds : ["__none__"] } } });
    }
    if (shotIds.length > 0) {
      await tx.shot.deleteMany({ where: { id: { notIn: shotIds }, project_id: { in: projectIds.length > 0 ? projectIds : ["__none__"] } } });
    }
    if (generationIds.length > 0) {
      await tx.generation.deleteMany({ where: { id: { notIn: generationIds }, shot_id: { in: shotIds.length > 0 ? shotIds : ["__none__"] } } });
    }
    if (characterIds.length > 0) {
      await tx.character.deleteMany({ where: { id: { notIn: characterIds }, project_id: { in: projectIds.length > 0 ? projectIds : ["__none__"] } } });
    }
    if (psIds.length > 0) {
      await tx.promptSettings.deleteMany({ where: { id: { notIn: psIds }, project_id: { in: projectIds.length > 0 ? projectIds : ["__none__"] } } });
    }
  }, { timeout: 30000 });
}

// Convenience helpers used by a few routes
export async function getDb() { return load(); }
export async function findProject(id: string) { return prisma.project.findUnique({ where: { id } }); }
export async function findEpisode(id: string) { return prisma.episode.findUnique({ where: { id } }); }
export async function findShot(id: string) { return prisma.shot.findUnique({ where: { id } }); }
