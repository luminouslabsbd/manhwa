import { prisma } from "@/lib/prisma";
import { queuePrompt, buildImageWorkflow, buildShotFromBaseWorkflow, uploadImage, getHost } from "@/lib/comfyui";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";

async function resolveRefImage(refImage: string, host: string): Promise<string> {
  if (!refImage.includes("/")) return refImage; // already a ComfyUI filename
  const localPath = path.join(process.cwd(), "public", refImage);
  const buf = readFileSync(localPath);
  const result = await uploadImage(Buffer.from(buf), path.basename(refImage), host);
  return result.name;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const frame = await prisma.frame.findUnique({ where: { id } });
  if (!frame) return Response.json({ error: "Not found" }, { status: 404 });

  const shot = await prisma.shot.findUnique({ where: { id: frame.shot_id } });
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: shot.project_id } });

  // Resolve character
  let char: { pipeline_model: string | null; reference_image: string | null; appearance: string | null; name: string | null } | null = null;
  if (shot.character) {
    char = await prisma.character.findFirst({
      where: { project_id: shot.project_id, name: { equals: shot.character, mode: "insensitive" } },
      select: { pipeline_model: true, reference_image: true, appearance: true, name: true },
    });
  }

  // Model: explicit → shot → character → project
  let model: string | null = body.model ?? shot.pipeline_model ?? char?.pipeline_model ?? project?.pipeline_model ?? null;

  // Reference image: character ref → project base
  const refImageRaw = char?.reference_image ?? project?.base_image_path ?? null;

  const seed = body.seed ?? Math.floor(Math.random() * 999999);

  // ── Detect environment/silhouette frame ──
  const ENV_RE = /silhouette|establishing|wide\s+shot|panoram|landscape|background|environment|storm|fog|mist|rain|dawn|dusk|sunset|sunrise|skyline|aerial|bird.?s.?eye|exterior|interior\s+shot|empty\s+room|scene\s+set/i;
  const CHAR_CLOSE_RE = /close.?up|face|expression|eye|emotion|reaction|extreme\s+close|portrait/i;
  const frameDesc = frame.description ?? "";
  const isEnvFrame = ENV_RE.test(frameDesc) && !CHAR_CLOSE_RE.test(frameDesc);

  let prompt: string;

  if (frame.prompt?.trim()) {
    // Explicit frame prompt stored — use as-is
    prompt = frame.prompt.trim();
  } else if (isEnvFrame) {
    // Environment frame: lead with scene description, character is silhouette only
    const charToken = char ? `${char.name ?? shot.character} as dark silhouette` : "dark silhouette figure";
    // Extract style tokens from full_prompt
    const styleMarkers = ["manhwa style", "detailed linework", "semi-realistic", "cinematic", "dramatic lighting"];
    let styleTokens = "";
    for (const m of styleMarkers) {
      const idx = shot.full_prompt.toLowerCase().indexOf(m.toLowerCase());
      if (idx > 0) { styleTokens = shot.full_prompt.slice(idx).trim(); break; }
    }
    prompt = [frameDesc, charToken, styleTokens].filter(Boolean).join(", ");
  } else {
    // Character-focused frame: use full prompt with frame description injected
    prompt = frameDesc ? `${frameDesc}, ${shot.full_prompt}` : shot.full_prompt;
    // Inject character appearance for text-to-image only
    if (char?.appearance && !refImageRaw) {
      const appearanceTokens = char.appearance.split(",").slice(0, 4).join(",").trim();
      if (!prompt.toLowerCase().includes(appearanceTokens.split(",")[0].trim().toLowerCase())) {
        prompt = `${prompt}, ${appearanceTokens}`;
      }
    }
  }

  try {
    const host = getHost();
    let prompt_id: string;

    if (refImageRaw) {
      // img2img: use character reference image for consistency
      const comfyRefImage = await resolveRefImage(refImageRaw, host);
      try {
        const wf = buildShotFromBaseWorkflow(prompt, comfyRefImage, seed, shot.width, shot.height, shot.steps, model, true);
        prompt_id = (await queuePrompt(wf, host)).prompt_id;
      } catch {
        // ip_adapter not available — fallback to controlnet or pure t2i
        const wf = buildShotFromBaseWorkflow(prompt, comfyRefImage, seed, shot.width, shot.height, shot.steps, model, false);
        prompt_id = (await queuePrompt(wf, host)).prompt_id;
      }
    } else {
      // No reference image — text-to-image
      const wf = buildImageWorkflow(prompt, seed, shot.width, shot.height, shot.steps, model);
      prompt_id = (await queuePrompt(wf, host)).prompt_id;
    }

    await prisma.generation.create({
      data: {
        id: randomUUID(),
        shot_id: frame.shot_id,
        type: `image${model ? `:${model}` : ""}:frame:${id}`,
        comfyui_prompt_id: prompt_id,
        status: "running",
        seed,
        image_path: null, video_path: null, audio_path: null,
        voice: null, error: null,
        ref_image: refImageRaw,
        created_at: new Date().toISOString(), completed_at: null,
      },
    });

    await prisma.frame.update({ where: { id }, data: { status: "generating" } });

    return Response.json({ ok: true, frame_id: id, prompt_id, used_ref: !!refImageRaw });
  } catch (e) {
    await prisma.frame.update({ where: { id }, data: { status: "failed" } });
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
