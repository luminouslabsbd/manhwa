import { load, save } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const char = (db.characters ?? []).find((c) => c.id === id);
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });
  const gens = db.generations.filter((g) => g.shot_id === id);
  const project = db.projects.find((p) => p.id === char.project_id);

  // Resolve the effective default model: char → project → env → null
  const defaultModel = char.pipeline_model ?? project?.pipeline_model ?? process.env.COMFYUI_MODEL ?? null;

  return Response.json({ character: char, generations: gens, defaultModel });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await load();
  const char = (db.characters ?? []).find((c) => c.id === id);
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });
  const allowed = ["name", "description", "appearance", "role", "reference_prompt", "seed", "status", "pipeline_model", "reference_image"];
  for (const key of allowed) {
    if (key in body) (char as Record<string, unknown>)[key] = body[key];
  }
  await save(db);
  return Response.json(char);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  db.characters = (db.characters ?? []).filter((c) => c.id !== id);
  db.generations = db.generations.filter((g) => g.shot_id !== id);
  await save(db);
  return Response.json({ ok: true });
}
