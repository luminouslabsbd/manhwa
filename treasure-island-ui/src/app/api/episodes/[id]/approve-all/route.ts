import { load, save } from "@/lib/db";

/** Approve the latest completed image generation for all "done" shots in this episode */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const shots = db.shots.filter((s) => s.episode_id === id && s.status === "done");
  let approved = 0;

  for (const shot of shots) {
    // Find the latest completed image generation for this shot
    const gen = db.generations
      .filter((g) => g.shot_id === shot.id && g.type === "image" && g.status === "completed")
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0];
    if (gen) {
      shot.approved_image_id = gen.id;
      shot.status = "approved";
      approved++;
    }
  }

  await save(db);
  return Response.json({ ok: true, approved, total: shots.length });
}
