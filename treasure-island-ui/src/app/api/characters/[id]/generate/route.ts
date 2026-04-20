import { prisma } from "@/lib/prisma";
import { queuePrompt, buildImageWorkflow, getHost, type LoraSpec } from "@/lib/comfyui";
import { randomUUID } from "crypto";
import { resolveActiveImageModel } from "@/lib/active-image-model";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const char = await prisma.character.findUnique({ where: { id } });
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: char.project_id } });
  // Same four-step resolution as /api/shots/[id]/generate — catalog active
  // model is consulted when no per-character/project override exists.
  const activeModel = await resolveActiveImageModel(body.model_id);
  const modelOverride: string | null =
    body.model
      ?? char.pipeline_model
      ?? project?.pipeline_model
      ?? activeModel?.ckpt
      ?? null;
  const p = activeModel?.params ?? {};
  const effSteps  = typeof p.steps  === "number" ? p.steps  : 25;
  const effWidth  = typeof p.width  === "number" ? p.width  : 768;
  const effHeight = typeof p.height === "number" ? p.height : 1024;

  const loras: LoraSpec[] | undefined = body.loras;
  const seed = body.seed ?? Math.floor(Math.random() * 999999);
  const prompt = char.reference_prompt || buildCharacterPrompt(char);

  try {
    const wf = buildImageWorkflow(prompt, seed, effWidth, effHeight, effSteps, modelOverride, loras);
    const { prompt_id } = await queuePrompt(wf, getHost());
    const genId = randomUUID();

    await prisma.generation.create({
      data: {
        id: genId, shot_id: id,
        type: modelOverride ? `image:${modelOverride}` : "image",
        comfyui_prompt_id: prompt_id, status: "running", seed,
        image_path: null, video_path: null, audio_path: null,
        voice: null, error: null, ref_image: null,
        created_at: new Date().toISOString(), completed_at: null,
      },
    });
    await prisma.character.update({ where: { id }, data: { status: "generating", seed } });

    return Response.json({ ok: true, generation_id: genId, prompt_id });
  } catch (e) {
    await prisma.character.update({ where: { id }, data: { status: "failed" } }).catch(() => {});
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

function buildCharacterPrompt(char: { name: string; appearance: string; description: string; role: string }) {
  return `Character reference sheet, full body portrait, front view, clean background, studio lighting, highly detailed anime/manhwa style illustration. ${char.name}: ${char.appearance}. ${char.description}. Role: ${char.role}. Consistent character design, neutral pose, clear features, white background`;
}
