import { load, save } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

/**
 * DELETE /api/episodes/:id/generations
 *
 * Query params:
 *   ?category=video|image|tts|all   (default: all)
 *   ?model=ltx2|wan2|any             (optional — restricts to a specific model; "any" = no filter)
 *
 * Bulk-deletes generations across every shot in the episode. Also clears approvals
 * and file contents for deleted records.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = await params;
  const url = new URL(req.url);
  const category = (url.searchParams.get("category") ?? "all").toLowerCase();
  const model = (url.searchParams.get("model") ?? "any").toLowerCase();

  if (!["video", "image", "tts", "all"].includes(category)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const db = await load();
  const shotIds = new Set(db.shots.filter(s => s.episode_id === episodeId).map(s => s.id));
  if (!shotIds.size) return Response.json({ error: "Episode has no shots" }, { status: 404 });

  const matchesCategory = (type: string): boolean => {
    if (category === "all")   return true;
    if (category === "video") return type === "video" || type.startsWith("video:");
    if (category === "image") return type === "image" || type.startsWith("image:");
    if (category === "tts")   return type === "tts";
    return false;
  };
  const matchesModel = (type: string): boolean => {
    if (model === "any")  return true;
    if (model === "ltx2") return type === "video:ltx2" || type.startsWith("video:ltx");
    if (model === "wan2") return type === "video" || type === "video:t2v_fallback" || type === "video:i2v_fallback";
    return false;
  };

  const toDelete = db.generations.filter(g =>
    shotIds.has(g.shot_id) && matchesCategory(g.type) && matchesModel(g.type)
  );
  if (!toDelete.length) return Response.json({ ok: true, deleted: 0 });

  // Remove local files (best-effort)
  for (const gen of toDelete) {
    for (const p of [gen.image_path, gen.video_path, gen.audio_path]) {
      if (!p) continue;
      try {
        const filePath = path.join(process.cwd(), "public", p);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch { /* ignore */ }
    }
  }

  const deletedIds = new Set(toDelete.map(g => g.id));
  db.generations = db.generations.filter(g => !deletedIds.has(g.id));

  // Clear approvals + reset affected shots when those generations were approved
  for (const shot of db.shots) {
    if (!shotIds.has(shot.id)) continue;
    if (shot.approved_image_id && deletedIds.has(shot.approved_image_id)) {
      shot.approved_image_id = null;
      shot.approved_image_ids = (shot.approved_image_ids ?? []).filter((gid: string) => !deletedIds.has(gid));
      shot.status = "draft";
    } else if (shot.approved_image_ids?.length) {
      shot.approved_image_ids = shot.approved_image_ids.filter((gid: string) => !deletedIds.has(gid));
    }
    if (shot.approved_video_id && deletedIds.has(shot.approved_video_id)) {
      shot.approved_video_id = null;
    }
    // If the shot's stored audio was deleted as part of TTS cleanup, clear it
    if (category === "tts" || category === "all") {
      shot.audio_path = null;
      shot.video_audio_path = null;
    }
  }

  await save(db);

  // Reset frame media when images were deleted
  if (category === "image" || category === "all") {
    try {
      await prisma.frame.updateMany({
        where: { shot_id: { in: [...shotIds] } },
        data: { image_path: null, video_path: null, status: "draft" },
      });
    } catch { /* frames table may not exist */ }
  }

  return Response.json({ ok: true, deleted: toDelete.length, category, model });
}
