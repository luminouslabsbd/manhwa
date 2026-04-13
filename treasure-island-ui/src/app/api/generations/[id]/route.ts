import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const shot = await prisma.shot.findUnique({ where: { id: gen.shot_id } });
    if (shot) {
      if (gen.type === "video" && shot.approved_video_id === id) {
        await prisma.shot.update({
          where: { id: shot.id },
          data: { approved_video_id: null, status: "approved" },
        });
      } else if ((gen.type === "image" || gen.type.startsWith("image:")) && (shot.approved_image_ids as string[] ?? []).includes(id)) {
        const newIds = (shot.approved_image_ids as string[] ?? []).filter(x => x !== id);
        await prisma.shot.update({
          where: { id: shot.id },
          data: {
            approved_image_ids: newIds,
            approved_image_id: newIds[newIds.length - 1] ?? null,
            status: newIds.length === 0 ? "done" : shot.status,
          },
        });
      } else if (gen.type === "tts" && shot.approved_tts_id === id) {
        await prisma.shot.update({ where: { id: shot.id }, data: { approved_tts_id: null } });
      }
    }
  }

  await prisma.generation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
