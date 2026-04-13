import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { load, save } from "@/lib/db";
import fs from "fs";
import path from "path";

function unlinkSafe(filePath: string) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gen = await prisma.generation.findUnique({ where: { id } });
  if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete files from disk
  if (gen.image_path) unlinkSafe(path.join(process.cwd(), "public", gen.image_path));
  if (gen.video_path) unlinkSafe(path.join(process.cwd(), "public", gen.video_path));
  if (gen.audio_path) unlinkSafe(path.join(process.cwd(), "public", gen.audio_path));

  // If this was the approved video/image/tts on the shot, clear the reference
  if (gen.shot_id) {
    const db = await load();
    const shot = db.shots.find(s => s.id === gen.shot_id);
    if (shot) {
      let changed = false;
      if (gen.type === "video" && shot.approved_video_id === id) {
        shot.approved_video_id = null;
        shot.status = "approved"; // revert to approved image state
        changed = true;
      } else if ((gen.type === "image" || gen.type.startsWith("image:")) && shot.approved_image_ids?.includes(id)) {
        shot.approved_image_ids = (shot.approved_image_ids ?? []).filter(x => x !== id);
        shot.approved_image_id = shot.approved_image_ids[shot.approved_image_ids.length - 1] ?? null;
        if (shot.approved_image_ids.length === 0) shot.status = "done";
        changed = true;
      } else if (gen.type === "tts" && shot.approved_tts_id === id) {
        shot.approved_tts_id = null;
        changed = true;
      }
      if (changed) await save(db);
    }
  }

  await prisma.generation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
