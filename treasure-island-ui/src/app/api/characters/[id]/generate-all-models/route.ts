import { prisma } from "@/lib/prisma";
import { queuePrompt, buildImageWorkflow, getHost } from "@/lib/comfyui";
import { randomUUID } from "crypto";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const char = await prisma.character.findUnique({ where: { id } });
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });

  const host = getHost();

  let models: string[] = [];
  try {
    const [ckptRes, unetRes] = await Promise.all([
      fetch(`${host}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${host}/object_info/UNETLoader`, { signal: AbortSignal.timeout(5000) }),
    ]);
    const ckptData = await ckptRes.json();
    const unetData = await unetRes.json();
    const checkpoints: string[] = ckptData?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
    const unets: string[] = (unetData?.UNETLoader?.input?.required?.unet_name?.[0] ?? [])
      .filter((u: string) => !u.includes("wan") && !u.includes("t2v") && !u.includes("i2v"));
    models = [...checkpoints, ...unets];
  } catch {
    return Response.json({ error: "Cannot reach ComfyUI" }, { status: 500 });
  }

  if (!models.length) return Response.json({ error: "No models found" }, { status: 400 });

  const prompt = char.reference_prompt || `${char.name}, ${char.appearance}, character portrait, manhwa style, clean background, studio lighting`;
  const seed = Math.floor(Math.random() * 999999);
  let queued = 0;

  for (const model of models) {
    try {
      const wf = buildImageWorkflow(prompt, seed, 768, 1024, 25, model);
      const { prompt_id } = await queuePrompt(wf, host);
      await prisma.generation.create({
        data: {
          id: randomUUID(), shot_id: id, type: `image:${model}`,
          comfyui_prompt_id: prompt_id, status: "running", seed,
          image_path: null, video_path: null, audio_path: null,
          voice: null, error: null, ref_image: null,
          created_at: new Date().toISOString(), completed_at: null,
        },
      });
      queued++;
    } catch { /* skip failed model */ }
  }

  await prisma.character.update({ where: { id }, data: { status: "generating", seed } });
  return Response.json({ ok: true, queued, models, seed });
}
