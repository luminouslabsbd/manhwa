import { load } from "@/lib/db";
import { getHost } from "@/lib/comfyui";
import { addGenerationJob } from "@/lib/gen-queue";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = await load();
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });

  const host = getHost();

  // Fetch all available models from ComfyUI
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

  const seed = body.seed ?? Math.floor(Math.random() * 999999);

  let queued = 0;
  for (const model of models) {
    await addGenerationJob({
      shot_id: id,
      project_id: shot.project_id,
      model,
      seed,
      full_prompt: shot.full_prompt,
      width: shot.width,
      height: shot.height,
      steps: shot.steps,
    });
    queued++;
  }

  await prisma.shot.update({ where: { id }, data: { status: "generating", seed } });
  return Response.json({ ok: true, queued, models, seed });
}
