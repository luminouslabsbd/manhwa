import "server-only";
import { prisma } from "@/lib/prisma";
import { getAppConfig } from "@/lib/app-config";

/**
 * Resolve the active image Model for the current admin selection, returning
 * the catalog row plus the ComfyUI checkpoint filename to feed into the
 * workflow builder. Image routes call this once at the top of POST so that
 * switching the active model in `/admin/settings` actually changes what gets
 * generated — previously the Settings picker was cosmetic because the
 * dispatcher only read shot/character/project.pipeline_model.
 *
 * Resolution:
 *   1. Explicit `body.model_id` from the request (per-call override)
 *   2. `AppConfig.active_image_model`
 *   3. No catalog match → return null, caller falls back to its legacy path
 *
 * The ComfyUI checkpoint filename comes from the row's `default_params.ckpt`
 * first (declarative), then the id→filename shim below (back-compat). This
 * shim lets older catalog rows keep working without a seed migration.
 */

// Known model.id → ComfyUI filename mapping. Kept here (not in pod-setup.sh)
// because pod-setup.sh uses these same filenames when downloading weights;
// we just map admin-friendly slugs to them.
const FALLBACK_CKPT_BY_ID: Record<string, string> = {
  "flux-schnell":    "flux1-schnell-fp8.safetensors",
  "sdxl-juggernaut": "juggernautXL_v9.safetensors",
  "sdxl-animagine":  "animagineXL31.safetensors",
};

export interface ActiveImageModel {
  id: string;
  workflow_id: string;
  ckpt: string;
  /** Catalog-level defaults for steps/cfg/width/height — caller may override. */
  params: Record<string, unknown>;
}

export async function resolveActiveImageModel(requestedId?: string | null): Promise<ActiveImageModel | null> {
  let modelId = (requestedId ?? "").trim();
  if (!modelId) {
    const cfg = await getAppConfig();
    modelId = cfg.active_image_model ?? "";
  }
  if (!modelId) return null;

  const row = await prisma.model.findUnique({ where: { id: modelId } });
  if (!row || row.category !== "image") return null;
  // Let admins disable a row to block it from being dispatched without
  // removing it entirely — useful for "we're downloading new weights" windows.
  if (!row.is_enabled) return null;

  const params = (row.default_params ?? {}) as Record<string, unknown>;
  const declaredCkpt = typeof params.ckpt === "string" ? params.ckpt : "";
  const ckpt = declaredCkpt || FALLBACK_CKPT_BY_ID[row.id] || "";
  if (!ckpt) return null; // catalogued but no known filename → bail

  return { id: row.id, workflow_id: row.workflow_id, ckpt, params };
}
