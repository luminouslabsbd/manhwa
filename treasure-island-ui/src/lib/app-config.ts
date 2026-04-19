import { prisma } from "@/lib/prisma";

export type VideoModel = "wan2" | "ltx2";

export interface AppConfigRow {
  id: string;
  video_model: VideoModel;
  updated_at: string;
}

const SINGLETON_ID = "default";

/** Read the global admin settings singleton. Creates the row if missing.
 *  Legacy rows with `video_model = "wan2"` are normalized to "ltx2" —
 *  the Wan 2.1 checkpoints are no longer downloaded by pod-setup.sh, so
 *  any request routed there would fail with "value_not_in_list".
 */
export async function getAppConfig(): Promise<AppConfigRow> {
  const row = await prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, video_model: "ltx2", updated_at: new Date().toISOString() },
  });
  const normalized: AppConfigRow = {
    ...(row as AppConfigRow),
    video_model: (row as AppConfigRow).video_model === "wan2" ? "ltx2" : (row as AppConfigRow).video_model,
  };
  return normalized;
}

/** Persist an update to the global admin settings. */
export async function setAppConfig(updates: Partial<Pick<AppConfigRow, "video_model">>): Promise<AppConfigRow> {
  const row = await prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    update: { ...updates, updated_at: new Date().toISOString() },
    create: {
      id: SINGLETON_ID,
      video_model: updates.video_model ?? "ltx2",
      updated_at: new Date().toISOString(),
    },
  });
  return row as AppConfigRow;
}
