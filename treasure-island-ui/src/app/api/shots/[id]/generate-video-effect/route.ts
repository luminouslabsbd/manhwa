import { load } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { ensureLocalFile, saveGenerated } from "@/lib/storage";
import { renderTimeline, imageToVideo, mergeAudioVideo, type ClipEffect, type TimelineClip } from "@/lib/ffmpeg-utils";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import os from "os";

const EFFECTS = new Set<ClipEffect>([
  "none", "fade-in", "fade-out", "fade-both",
  "ken-burns", "zoom-in", "zoom-out",
  "pan-left", "pan-right", "pan-up", "pan-down",
  "shake",
]);

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const DEFAULT_DURATION_MS = 4000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    effect?: ClipEffect;
    duration_ms?: number;
    caption?: string;
  } | null;

  if (!body?.effect || !EFFECTS.has(body.effect)) {
    return Response.json({ error: "valid effect required" }, { status: 400 });
  }

  const db = await load();
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  const approvedId = shot.approved_image_ids?.length
    ? shot.approved_image_ids[shot.approved_image_ids.length - 1]
    : shot.approved_image_id;
  if (!approvedId) return Response.json({ error: "No approved image" }, { status: 400 });

  const approvedGen = db.generations.find((g) => g.id === approvedId);
  if (!approvedGen?.image_path) {
    return Response.json({ error: "approved image path missing" }, { status: 400 });
  }

  // If TTS exists we match its duration so caption timing stays in sync.
  let audioDurationMs: number | null = null;
  let localAudioPath: string | null = null;
  if (shot.audio_path) {
    try {
      localAudioPath = await ensureLocalFile(shot.audio_path);
      const buf = fs.readFileSync(localAudioPath);
      if (buf.length >= 44) {
        const dataSize = buf.readUInt32LE(40);
        const sampleRate = buf.readUInt32LE(24);
        const channels = buf.readUInt16LE(22);
        const bitsPerSample = buf.readUInt16LE(34);
        audioDurationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
      }
    } catch {
      localAudioPath = null;
    }
  }

  const durationMs = Math.max(
    1500,
    Math.min(8000, body.duration_ms ?? audioDurationMs ?? DEFAULT_DURATION_MS),
  );

  // Create the generation row upfront so the UI immediately shows a "running" tile.
  const genId = randomUUID();
  const genType = `video:effect:${body.effect}`;
  await prisma.generation.create({
    data: {
      id: genId,
      shot_id: id,
      type: genType,
      comfyui_prompt_id: null,
      status: "running",
      seed: 0,
      image_path: approvedGen.image_path,
      video_path: null,
      audio_path: shot.audio_path ?? null,
      error: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    },
  });

  let localImagePath: string;
  try {
    localImagePath = await ensureLocalFile(approvedGen.image_path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.generation.update({
      where: { id: genId },
      data: { status: "failed", error: msg.slice(0, 500), completed_at: new Date().toISOString() },
    });
    return Response.json({ error: msg }, { status: 500 });
  }

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "shot_effect_"));
  const intermediatePath = path.join(scratchDir, "base.mp4");
  const timelinePath = path.join(scratchDir, "timeline.mp4");

  try {
    await imageToVideo(localImagePath, localAudioPath, intermediatePath, {
      durationMs,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
    });

    const clip: TimelineClip = {
      videoPath: intermediatePath,
      effect: body.effect,
      transition: "cut",
      caption: body.caption?.trim() || undefined,
      captionStyle: body.caption?.trim() ? { fontSize: 28, bottomPad: 40, bgOpacity: 0.55 } : undefined,
    };

    await renderTimeline([clip], {
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      outputPath: timelinePath,
    });

    // If we had audio, mux it onto the effect-rendered silent clip so the saved
    // video matches what /api/shots/:id/generate-video produces via the poller.
    let finalBuffer: Buffer;
    if (localAudioPath) {
      try {
        const mergedRelative = await mergeAudioVideo(timelinePath, localAudioPath);
        const mergedAbs = path.join(process.cwd(), "public", mergedRelative.replace(/^\//, ""));
        finalBuffer = fs.readFileSync(mergedAbs);
        try { fs.unlinkSync(mergedAbs); } catch { /* noop */ }
      } catch {
        finalBuffer = fs.readFileSync(timelinePath);
      }
    } else {
      finalBuffer = fs.readFileSync(timelinePath);
    }

    const filename = `${genId}.mp4`;
    const videoPath = await saveGenerated(finalBuffer, shot.project_id, filename);

    await prisma.generation.update({
      where: { id: genId },
      data: {
        status: "completed",
        video_path: videoPath,
        completed_at: new Date().toISOString(),
      },
    });

    return Response.json({
      ok: true,
      generation_id: genId,
      video_path: videoPath,
      effect: body.effect,
      duration_ms: durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.generation.update({
      where: { id: genId },
      data: { status: "failed", error: msg.slice(0, 500), completed_at: new Date().toISOString() },
    });
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}
