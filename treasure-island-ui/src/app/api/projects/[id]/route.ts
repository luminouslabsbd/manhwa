import { load, save } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const p = db.projects.find((x) => x.id === id);
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });
  const shots = db.shots.filter((s) => s.project_id === id);
  return Response.json({
    ...p,
    episode_count: db.episodes.filter((e) => e.project_id === id).length,
    shot_count: shots.length,
    approved_count: shots.filter((s) => s.status === "approved").length,
    video_count: shots.filter((s) => s.approved_video_id).length,
    default_model: p.pipeline_model ?? process.env.COMFYUI_MODEL ?? null,
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const shotIds = db.shots.filter((s) => s.project_id === id).map((s) => s.id);
  db.generations = db.generations.filter((g) => !shotIds.includes(g.shot_id));
  db.shots = db.shots.filter((s) => s.project_id !== id);
  db.episodes = db.episodes.filter((e) => e.project_id !== id);
  db.projects = db.projects.filter((p) => p.id !== id);
  await save(db);
  return Response.json({ ok: true });
}
