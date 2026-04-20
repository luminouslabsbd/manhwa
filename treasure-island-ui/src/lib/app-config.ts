import { prisma } from "@/lib/prisma";

/**
 * Legacy string union kept for backward compatibility with earlier UI code.
 * New code should treat these as free-form Model.id slugs instead.
 */
export type VideoModel = "wan2" | "ltx2";

export type ModelCategory = "image" | "video" | "tts" | "content";

export interface AppConfigRow {
  id: string;
  /** @deprecated — read `active_video_model` instead. Kept as legacy mirror. */
  video_model: VideoModel | string;
  /** Model.id of the globally active image workflow (e.g. "flux-schnell"). */
  active_image_model: string;
  /** Model.id of the globally active video workflow (e.g. "ltx2-distilled"). */
  active_video_model: string;
  /** Model.id of the globally active TTS workflow (e.g. "xtts-v2"). */
  active_tts_model: string;
  /** Model.id of the globally active content/LLM model (e.g. "qwen2.5-7b"). */
  active_content_model: string;
  updated_at: string;
}

const SINGLETON_ID = "default";

/**
 * Normalize legacy values. Older rows stored `video_model = "ltx2"` / `"wan2"`;
 * we map those to the new catalog slugs so a single read returns a consistent
 * view regardless of when the row was last written.
 */
function normalize(row: AppConfigRow): AppConfigRow {
  const mapLegacy = (v: string) => {
    if (v === "wan2") return "wan2-i2v-14b";
    if (v === "ltx2") return "ltx2-distilled";
    return v;
  };
  return {
    ...row,
    video_model: mapLegacy(row.video_model as string),
    active_video_model: mapLegacy(row.active_video_model),
  };
}

/**
 * Read the global admin settings singleton. Creates the row with sensible
 * defaults if it's missing (first-run).
 */
export async function getAppConfig(): Promise<AppConfigRow> {
  const row = await prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: {
      id: SINGLETON_ID,
      video_model: "ltx2-distilled",
      active_image_model: "flux-schnell",
      active_video_model: "ltx2-distilled",
      active_tts_model: "xtts-v2",
      active_content_model: "qwen2.5-7b",
      updated_at: new Date().toISOString(),
    },
  });
  return normalize(row as AppConfigRow);
}

type UpdatableFields =
  | "video_model"
  | "active_image_model"
  | "active_video_model"
  | "active_tts_model"
  | "active_content_model";

/**
 * Persist an update to the global admin settings.
 *
 * Setting `active_video_model` also mirrors it into `video_model` for the
 * older UI code that still reads the legacy field. Once those call sites
 * migrate, the `video_model` column can be dropped in a follow-up migration.
 */
export async function setAppConfig(
  updates: Partial<Pick<AppConfigRow, UpdatableFields>>
): Promise<AppConfigRow> {
  // Mirror active_video_model ↔ video_model during the transition.
  const patch: Partial<Pick<AppConfigRow, UpdatableFields>> = { ...updates };
  if (patch.active_video_model && !patch.video_model) {
    patch.video_model = patch.active_video_model;
  }

  const row = await prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    update: { ...patch, updated_at: new Date().toISOString() },
    create: {
      id: SINGLETON_ID,
      video_model: patch.video_model ?? "ltx2-distilled",
      active_image_model: patch.active_image_model ?? "flux-schnell",
      active_video_model: patch.active_video_model ?? "ltx2-distilled",
      active_tts_model: patch.active_tts_model ?? "xtts-v2",
      active_content_model: patch.active_content_model ?? "qwen2.5-7b",
      updated_at: new Date().toISOString(),
    },
  });
  return normalize(row as AppConfigRow);
}

/**
 * Resolve the active Model.id for a category. Small wrapper that keeps call
 * sites from having to learn the column names.
 */
export async function getActiveModelId(category: ModelCategory): Promise<string> {
  const cfg = await getAppConfig();
  switch (category) {
    case "image":   return cfg.active_image_model;
    case "video":   return cfg.active_video_model;
    case "tts":     return cfg.active_tts_model;
    case "content": return cfg.active_content_model;
  }
}
