/**
 * POST /api/characters/:id/generate-shots
 * Queue generation for all shots that reference this character, using the character's model.
 */
import { prisma } from "@/lib/prisma";
import { addGenerationJob } from "@/lib/queue";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const char = await prisma.character.findUnique({ where: { id } });
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: char.project_id } });

  // Resolve model: char explicit → char latest generation → project → env
  let model = char.pipeline_model ?? project?.pipeline_model ?? process.env.COMFYUI_MODEL ?? null;
  if (!model) {
    const latestGen = await prisma.generation.findFirst({
      where: { shot_id: id, status: "completed", type: { startsWith: "image" } },
      orderBy: { created_at: "desc" },
    });
    if (latestGen?.type.includes(":")) {
      model = latestGen.type.split(":")[1];
    }
  }
  if (!model) return Response.json({ error: "No model resolved for this character" }, { status: 400 });

  // Find all shots referencing this character (by name, case-insensitive match)
  const shots = await prisma.shot.findMany({
    where: {
      project_id: char.project_id,
      character: { equals: char.name, mode: "insensitive" },
      status: body.regenerateAll ? undefined : { in: ["draft", "failed"] },
    },
  });

  if (!shots.length) return Response.json({ ok: true, queued: 0, model });

  const refImage = char.reference_image ?? project?.base_image_path ?? null;
  let queued = 0;

  for (const shot of shots) {
    const seed = Math.floor(Math.random() * 999999);
    await addGenerationJob({
      shot_id: shot.id,
      project_id: shot.project_id,
      model,
      seed,
      full_prompt: shot.full_prompt,
      width: shot.width,
      height: shot.height,
      steps: shot.steps,
      ref_image: refImage,
    });
    await prisma.shot.update({
      where: { id: shot.id },
      data: { status: "generating", seed },
    });
    queued++;
  }

  return Response.json({ ok: true, queued, model });
}
