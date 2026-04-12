import { load, save } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });
  const generations = db.generations.filter((g) => g.shot_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return Response.json({ shot, generations });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await load();
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });
  const allowed = ["character", "shot_description", "environment", "lighting", "camera_angle", "full_prompt", "negative_prompt", "seed", "width", "height", "steps", "status", "story_line", "dialogue", "anchor", "approved_video_id", "pipeline_model", "prompt_template_id", "interaction_type"];
  for (const key of allowed) {
    if (key in body) (shot as Record<string, unknown>)[key] = body[key];
  }
  await save(db);
  return Response.json(shot);
}
