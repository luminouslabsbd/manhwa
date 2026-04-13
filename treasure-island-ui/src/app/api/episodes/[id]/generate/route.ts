import { load } from "@/lib/db";
import { getHost } from "@/lib/comfyui";
import { addGenerationJob, MAX_CONCURRENT } from "@/lib/gen-queue";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const regenerateAll = body.regenerateAll === true;

  const db = await load();
  const shots = db.shots.filter((s) => s.episode_id === id);
  const allEligible = regenerateAll
    ? shots
    : shots.filter((s) => ["draft", "failed"].includes(s.status));

  // Only generate shots that have a character assigned
  const skippedNoChar = allEligible.filter(s => !s.character?.trim()).length;
  const eligible = allEligible.filter(s => s.character?.trim());

  if (!eligible.length) return Response.json({ ok: true, queued: 0, skippedNoChar });

  const episode = db.episodes.find((e) => e.id === id);
  const project = episode ? db.projects.find((p) => p.id === episode.project_id) : null;
  const modelOverride: string | null = body.model ?? null;
  const loras = body.loras;
  const host = getHost();

  // Fetch available models from ComfyUI
  let models: string[] = [];
  try {
    const [ckptRes, unetRes] = await Promise.all([
      fetch(`${host}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
      fetch(`${host}/object_info/UNETLoader`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => ({})),
    ]);
    const checkpoints: string[] = ckptRes?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
    const unets: string[] = (unetRes?.UNETLoader?.input?.required?.unet_name?.[0] ?? [])
      .filter((u: string) => !u.includes("wan") && !u.includes("t2v") && !u.includes("i2v"));
    models = [...checkpoints, ...unets];
  } catch {
    return Response.json({ error: "Cannot reach ComfyUI" }, { status: 500 });
  }

  const body_models: string[] | undefined = body.models; // explicit subset from RegenModal

  // When explicitly requesting all models (Regen All), use all available models.
  // When generating new (non-regen), use one model per shot: character model > project model.
  const useAllModels = regenerateAll && !modelOverride && !body_models;
  const allModelsToUse = modelOverride
    ? [modelOverride]
    : body_models
      ? body_models
      : useAllModels
        ? (models.length ? models : [project?.pipeline_model].filter(Boolean) as string[])
        : null; // null = per-shot model

  if (allModelsToUse && !allModelsToUse.length) return Response.json({ error: "No models found" }, { status: 400 });

  let queued = 0;
  for (const shot of eligible) {
    const seed = Math.floor(Math.random() * 999999);

    // Resolve character ref image at queue time so it's stored in pipeline log history
    const char = shot.character
      ? (db.characters ?? []).find(c => c.project_id === shot.project_id && c.name === shot.character)
      : null;
    const refImage = char?.reference_image ?? project?.base_image_path ?? null;

    // Determine per-shot model when not using an explicit override
    let shotModels: string[];
    if (allModelsToUse) {
      shotModels = allModelsToUse;
    } else {
      // Single model: character → project → first available → env default
      const singleModel = char?.pipeline_model ?? project?.pipeline_model ?? models[0] ?? process.env.COMFYUI_MODEL ?? null;
      if (!singleModel) continue;
      shotModels = [singleModel];
    }

    for (const model of shotModels) {
      await addGenerationJob({
        shot_id: shot.id,
        project_id: shot.project_id,
        model,
        seed,
        loras,
        full_prompt: shot.full_prompt,
        width: shot.width,
        height: shot.height,
        steps: shot.steps,
        ref_image: refImage,
      });
      queued++;
    }
    await prisma.shot.update({
      where: { id: shot.id },
      data: { status: "generating", approved_image_id: null, approved_video_id: null, seed },
    });
  }

  return Response.json({ ok: true, queued, skippedNoChar, models: allModelsToUse ?? "per-shot", regenerateAll });
}
