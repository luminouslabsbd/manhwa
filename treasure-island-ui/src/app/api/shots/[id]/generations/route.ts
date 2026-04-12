import { load, save } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

// DELETE all generations (images + videos + TTS) for a shot and reset its status
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const shot = db.shots.find(s => s.id === id);
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });

  const gens = db.generations.filter(g => g.shot_id === id);

  // Delete files from disk
  for (const gen of gens) {
    for (const p of [gen.image_path, gen.video_path, gen.audio_path]) {
      if (!p) continue;
      try {
        const filePath = path.join(process.cwd(), "public", p);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch { /* ignore */ }
    }
  }

  // Remove from DB
  db.generations = db.generations.filter(g => g.shot_id !== id);

  // Reset shot status and approvals
  shot.status = "draft";
  shot.approved_image_id = null;
  shot.approved_video_id = null;
  shot.audio_path = null;
  shot.video_audio_path = null;

  await save(db);

  // Also reset frame statuses
  try {
    const frames = await prisma.frame.findMany({ where: { shot_id: id } });
    if (frames.length) {
      await prisma.frame.updateMany({
        where: { shot_id: id },
        data: { image_path: null, video_path: null, status: "draft" },
      });
    }
  } catch { /* frames table may not exist */ }

  return Response.json({ ok: true, deleted: gens.length });
}
