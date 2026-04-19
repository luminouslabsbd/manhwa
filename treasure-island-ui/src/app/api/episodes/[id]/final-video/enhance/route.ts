import { prisma } from "@/lib/prisma";
import { load } from "@/lib/db";
import { enhanceVideoFfmpeg, getVideoDuration } from "@/lib/ffmpeg-utils";
import { ensureLocalFile, saveGenerated } from "@/lib/storage";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const episodeShotId = (epId: string) => `episode_${epId}`;

// POST body: { generation_id: string, mode?: "ffmpeg" | "comfyui", scale?: number }
// mode "comfyui" is reserved for a future ComfyUI upscale workflow — for now both paths
// run the ffmpeg enhancement so the UI flow works end-to-end.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: epId } = await params;
  const body = await req.json().catch(() => ({})) as {
    generation_id?: string;
    video_path?: string;
    mode?: "ffmpeg" | "comfyui";
    scale?: number;
  };

  const db = await load();
  const episode = db.episodes.find((e) => e.id === epId);
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  // Resolve the source video: either a specific generation row or an explicit path,
  // otherwise the most recent final_video render for this episode.
  let sourceRelative: string | null = null;
  if (body.generation_id) {
    const g = await prisma.generation.findUnique({ where: { id: body.generation_id } });
    if (!g?.video_path) return Response.json({ error: "Generation has no video_path" }, { status: 400 });
    sourceRelative = g.video_path;
  } else if (body.video_path) {
    sourceRelative = body.video_path;
  } else {
    const latest = await prisma.generation.findFirst({
      where: { shot_id: episodeShotId(epId), type: "final_video", status: "completed" },
      orderBy: { created_at: "desc" },
    });
    if (!latest?.video_path) return Response.json({ error: "No final video to enhance yet" }, { status: 400 });
    sourceRelative = latest.video_path;
  }

  let sourceLocal: string;
  try {
    sourceLocal = await ensureLocalFile(sourceRelative);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "source fetch failed";
    return Response.json({ error: msg }, { status: 400 });
  }

  const ts = Date.now();
  const filename = `episode_${epId}_enhanced_${ts}.mp4`;
  const absDir = path.join(process.cwd(), "public", "generated", episode.project_id);
  fs.mkdirSync(absDir, { recursive: true });
  const outputPath = path.join(absDir, filename);

  try {
    // NOTE: when a ComfyUI video-upscale workflow (Real-ESRGAN etc.) is wired up,
    // branch on body.mode === "comfyui" here and queue that workflow instead.
    await enhanceVideoFfmpeg(sourceLocal, outputPath, {
      scale: body.scale ?? 1.5,
      sharpen: true,
      denoise: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "enhance failed";
    console.error("[enhance] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }

  try {
    const buf = fs.readFileSync(outputPath);
    await saveGenerated(buf, episode.project_id, filename);
  } catch { /* local file is already written */ }

  const relative = `/generated/${episode.project_id}/${filename}`;
  let durationMs: number | null = null;
  try { durationMs = await getVideoDuration(outputPath); } catch { /* noop */ }

  const gen = await prisma.generation.create({
    data: {
      id: randomUUID(),
      shot_id: episodeShotId(epId),
      type: "final_video_enhanced",
      comfyui_prompt_id: null,
      status: "completed",
      seed: null,
      image_path: null,
      video_path: relative,
      audio_path: null,
      voice: null,
      error: null,
      ref_image: null,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    },
  });

  return Response.json({ ok: true, generation: gen, video_path: relative, duration_ms: durationMs });
}
