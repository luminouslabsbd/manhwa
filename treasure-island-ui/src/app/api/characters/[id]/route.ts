import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const char = await prisma.character.findUnique({ where: { id } });
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });

  // Character generations are stored with shot_id = character.id — query directly
  const gens = await prisma.generation.findMany({ where: { shot_id: id }, orderBy: { created_at: "asc" } });

  const project = await prisma.project.findUnique({ where: { id: char.project_id } });
  const defaultModel = char.pipeline_model ?? project?.pipeline_model ?? process.env.COMFYUI_MODEL ?? null;

  return Response.json({ character: char, generations: gens, defaultModel });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const char = await prisma.character.findUnique({ where: { id } });
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });
  const allowed = ["name", "description", "appearance", "role", "reference_prompt", "seed", "status", "pipeline_model", "reference_image"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }
  const updated = await prisma.character.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Delete all generations for this character first (shot_id = character id)
  await prisma.generation.deleteMany({ where: { shot_id: id } });
  await prisma.character.delete({ where: { id } });
  return Response.json({ ok: true });
}
