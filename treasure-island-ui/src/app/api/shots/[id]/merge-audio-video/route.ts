import { load, save } from "@/lib/db";
import { mergeAudioVideo } from "@/lib/ffmpeg-utils";
import path from "path";
import { randomUUID } from "crypto";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const shot = db.shots.find((s) => s.id === id);

  if (!shot) {
    return Response.json({ error: "Shot not found" }, { status: 404 });
  }

  if (!shot.audio_path) {
    return Response.json(
      { error: "Audio path missing" },
      { status: 400 }
    );
  }

  // Find the latest video generation (prefer approved, any video/video:* type)
  const isVideoType = (g: { type: string }) => g.type === "video" || g.type.startsWith("video:");
  const approvedGen = shot.approved_video_id
    ? db.generations.find((g) => g.id === shot.approved_video_id && g.status === "completed" && g.video_path)
    : null;
  const latestVideoGen = approvedGen ?? [...db.generations]
    .filter((g) => g.shot_id === id && isVideoType(g) && g.status === "completed" && g.video_path)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .pop() ?? null;

  if (!latestVideoGen?.video_path) {
    return Response.json(
      { error: "No completed video generation found" },
      { status: 400 }
    );
  }

  try {
    const videoPath = path.join(process.cwd(), "public", latestVideoGen.video_path.replace(/^\//, ""));
    const audioPath = path.join(process.cwd(), "public", shot.audio_path.replace(/^\//, ""));

    // Merge audio and video (returns relative path like /generated/videos/file.mp4)
    const relativeMergedPath = await mergeAudioVideo(videoPath, audioPath);

    // Update shot with merged video path
    shot.video_audio_path = relativeMergedPath;
    shot.status = "video_done";

    // Create a generation record for the merge
    const mergeGen = {
      id: randomUUID(),
      shot_id: id,
      type: "video_merge",
      comfyui_prompt_id: null,
      status: "completed",
      seed: null,
      image_path: null,
      video_path: relativeMergedPath,
      audio_path: shot.audio_path,
      error: null,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    db.generations.push(mergeGen);
    await save(db);

    return Response.json({
      ok: true,
      video_audio_path: relativeMergedPath,
      generation: mergeGen,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Merge failed";
    console.error("Audio-video merge failed:", message);

    return Response.json({ error: message }, { status: 500 });
  }
}
