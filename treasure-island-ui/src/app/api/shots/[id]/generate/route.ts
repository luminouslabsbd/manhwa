import { queuePrompt, buildShotFromBaseWorkflow, buildImageWorkflow, uploadImage, getHost, type LoraSpec } from "@/lib/comfyui";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";

async function resolveRefImage(refImage: string, host: string): Promise<string> {
  if (!refImage.includes("/")) return refImage;
  const localPath = path.join(process.cwd(), "public", refImage);
  const buf = readFileSync(localPath);
  const result = await uploadImage(Buffer.from(buf), path.basename(refImage), host);
  return result.name;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });

  // Require a character to be assigned before generating
  if (!shot.character?.trim()) {
    return Response.json({ error: "no_character", message: "Assign a character to this shot before generating." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: shot.project_id } });

  // Resolve character for this shot
  const char = shot.character
    ? await prisma.character.findFirst({ where: { project_id: shot.project_id, name: { equals: shot.character, mode: "insensitive" } } })
    : null;

  // Model resolution: explicit body → shot → character → project → env default
  const modelOverride: string =
    body.model ?? shot.pipeline_model ?? char?.pipeline_model ?? project?.pipeline_model ?? process.env.COMFYUI_MODEL ?? "default";

  const loras: LoraSpec[] | undefined = body.loras;
  const seed: number = body.seed ?? Math.floor(Math.random() * 999999);
  const host = getHost();

  // ── Frame-based generation ─────────────────────────────────────────────
  if (body.generateFrames) {
    const frames = await prisma.frame.findMany({
      where: { shot_id: id, needed: true },
      orderBy: { frame_number: "asc" },
    });

    if (frames.length > 0) {
      // Prefer character ref image → project base image
      const refImageRaw = char?.reference_image ?? project?.base_image_path ?? null;

      // Resolve ref image ONCE before the loop — avoids redundant uploads per frame
      let resolvedRefImage: string | null = null;
      if (refImageRaw) {
        try {
          resolvedRefImage = await resolveRefImage(refImageRaw, host);
        } catch (e) {
          console.error("Failed to resolve ref image, falling back to text-to-image:", e);
        }
      }

      let queued = 0;
      for (const frame of frames) {
        const framePrompt = frame.prompt?.trim()
          ? frame.prompt
          : frame.description
            ? `${frame.description}, ${shot.full_prompt}`
            : shot.full_prompt;
        const frameSeed = seed + frame.frame_number;

        try {
          const refImage = resolvedRefImage;
          let prompt_id: string;

          if (refImage) {
            try {
              const wf = buildShotFromBaseWorkflow(framePrompt, refImage, frameSeed, shot.width, shot.height, shot.steps, modelOverride, true, loras);
              prompt_id = (await queuePrompt(wf, host)).prompt_id;
            } catch {
              try {
                const wf = buildShotFromBaseWorkflow(framePrompt, refImage, frameSeed, shot.width, shot.height, shot.steps, modelOverride, false, loras);
                prompt_id = (await queuePrompt(wf, host)).prompt_id;
              } catch {
                // Final fallback: text-to-image (no ref)
                const wf = buildImageWorkflow(framePrompt, frameSeed, shot.width, shot.height, shot.steps, modelOverride, loras);
                prompt_id = (await queuePrompt(wf, host)).prompt_id;
              }
            }
          } else {
            const wf = buildImageWorkflow(framePrompt, frameSeed, shot.width, shot.height, shot.steps, modelOverride, loras);
            prompt_id = (await queuePrompt(wf, host)).prompt_id;
          }

          const genType = `image${modelOverride ? `:${modelOverride}` : ""}:frame:${frame.id}`;
          await prisma.generation.create({
            data: {
              id: randomUUID(), shot_id: id, type: genType,
              comfyui_prompt_id: prompt_id, status: "running", seed: frameSeed,
              image_path: null, video_path: null, audio_path: null,
              voice: null, error: null, ref_image: refImageRaw,
              created_at: new Date().toISOString(), completed_at: null,
            },
          });
          await prisma.frame.update({ where: { id: frame.id }, data: { status: "generating" } });
          queued++;
        } catch (e) {
          console.error(`Frame ${frame.id} generation failed:`, e);
        }
      }

      await prisma.shot.update({ where: { id }, data: { status: "generating", seed } });
      return Response.json({ ok: true, mode: "frames", queued });
    }
    // Fall through — no frames, generate full prompt below
  }

  // ── Standard single-prompt generation ─────────────────────────────────
  // Prefer character ref image → project base image
  const refImageRaw = char?.reference_image ?? project?.base_image_path ?? null;

  try {
    const refImage = refImageRaw ? await resolveRefImage(refImageRaw, host) : null;

    let prompt_id: string;
    if (refImage) {
      try {
        const wf = buildShotFromBaseWorkflow(shot.full_prompt, refImage, seed, shot.width, shot.height, shot.steps, modelOverride, true, loras);
        prompt_id = (await queuePrompt(wf, host)).prompt_id;
      } catch {
        const wf = buildShotFromBaseWorkflow(shot.full_prompt, refImage, seed, shot.width, shot.height, shot.steps, modelOverride, false, loras);
        prompt_id = (await queuePrompt(wf, host)).prompt_id;
      }
    } else {
      const wf = buildImageWorkflow(shot.full_prompt, seed, shot.width, shot.height, shot.steps, modelOverride, loras);
      prompt_id = (await queuePrompt(wf, host)).prompt_id;
    }

    const genType = `image:${modelOverride}`;
    await prisma.generation.create({
      data: {
        id: randomUUID(), shot_id: id, type: genType,
        comfyui_prompt_id: prompt_id, status: "running", seed,
        image_path: null, video_path: null, audio_path: null,
        voice: null, error: null, ref_image: refImageRaw,
        created_at: new Date().toISOString(), completed_at: null,
      },
    });
    await prisma.shot.update({
      where: { id },
      data: {
        status: "generating",
        seed,
        ...(body.model ? {} : { approved_image_id: null, approved_video_id: null }),
      },
    });
    return Response.json({ ok: true, mode: "full_prompt", prompt_id });
  } catch (e) {
    await prisma.shot.update({ where: { id }, data: { status: "failed" } });
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
