import { load, save } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { generation_id } = await req.json();
  const db = await load();
  const gen = db.generations.find((g) => g.id === generation_id && g.shot_id === id);
  if (!gen) return Response.json({ error: "Generation not found" }, { status: 404 });
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });
  if (gen.type === "tts") {
    // Toggle TTS approval
    shot.approved_tts_id = shot.approved_tts_id === generation_id ? null : generation_id;
  } else if (gen.type === "video") {
    shot.approved_video_id = generation_id;
    shot.status = "video_done";
  } else {
    // Image: toggle in approved_image_ids array
    if (!shot.approved_image_ids) shot.approved_image_ids = [];
    const idx = shot.approved_image_ids.indexOf(generation_id);
    if (idx === -1) {
      shot.approved_image_ids.push(generation_id);
    } else {
      shot.approved_image_ids.splice(idx, 1);
    }
    // Keep legacy field in sync with last approved (or null)
    shot.approved_image_id = shot.approved_image_ids[shot.approved_image_ids.length - 1] ?? null;
    shot.status = shot.approved_image_ids.length > 0 ? "approved" : "done";
  }
  await save(db);
  return Response.json({ ok: true, approved_image_ids: shot.approved_image_ids });
}
