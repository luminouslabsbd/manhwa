import { prisma } from "@/lib/prisma";
import { load } from "@/lib/db";
import {
  renderTimeline,
  getVideoDuration,
  getAudioDuration,
  imageToVideo,
  type TimelineClip,
  type ClipEffect,
  type ClipTransition,
  type CaptionStyle,
} from "@/lib/ffmpeg-utils";
import { toLocalPath, ensureLocalFile, saveGenerated } from "@/lib/storage";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";

// Pseudo shot_id used for episode-level final renders so Generation rows stay queryable.
const episodeShotId = (epId: string) => `episode_${epId}`;

type Shot = {
  id: string;
  shot_number: number;
  character: string | null;
  story_line: string | null;
  dialogue: string | null;
  approved_video_id: string | null;
  approved_image_id: string | null;
  audio_path: string | null;
  video_audio_path: string | null;
};

type ClipInput = {
  shot_id?: string;
  source?: "shot_video" | "shot_video_with_audio" | "shot_image" | "custom";
  custom_video_url?: string;   // used when source = "custom"
  duration_ms?: number;        // optional override
  effect?: ClipEffect;
  transition?: ClipTransition; // transition INTO this clip
  transition_ms?: number;
  caption?: string;            // optional per-clip caption override
};

type CaptionsSetting = {
  source: "off" | "dialogue" | "story_line";
  font_size?: number;
  bottom_pad?: number;
  bg_opacity?: number;
};

// ─── GET: list shots + prior final renders ─────────────────────────────────
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: epId } = await params;
  const db = await load();

  const episode = db.episodes.find((e) => e.id === epId);
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  const shots = db.shots
    .filter((s) => s.episode_id === epId)
    .sort((a, b) => a.shot_number - b.shot_number);

  const shotSummaries = await Promise.all(shots.map(async (s) => {
    const approvedVideoGen = s.approved_video_id
      ? db.generations.find((g) => g.id === s.approved_video_id && g.status === "completed" && g.video_path)
      : null;
    const approvedImageGen = s.approved_image_id
      ? db.generations.find((g) => g.id === s.approved_image_id && g.status === "completed" && g.image_path)
      : null;

    const videoPath = approvedVideoGen?.video_path ?? null;
    const imagePath = approvedImageGen?.image_path ?? null;
    const mergedVideoPath = s.video_audio_path ?? null;
    const audioPath = s.audio_path ?? null;

    // Duration estimate: prefer merged-with-audio → raw video → TTS audio duration
    let durationMs: number | null = null;
    const pickForDuration = mergedVideoPath ?? videoPath;
    if (pickForDuration) {
      try {
        const local = toLocalPath(pickForDuration);
        if (fs.existsSync(local)) durationMs = await getVideoDuration(local);
      } catch { /* ignore */ }
    }
    if (durationMs == null && audioPath) {
      try {
        const local = toLocalPath(audioPath);
        if (fs.existsSync(local)) durationMs = await getAudioDuration(local);
      } catch { /* ignore */ }
    }

    return {
      id: s.id,
      shot_number: s.shot_number,
      character: s.character,
      story_line: s.story_line,
      dialogue: s.dialogue,
      approved_image_id: s.approved_image_id,
      approved_video_id: s.approved_video_id,
      video_path: videoPath,
      video_audio_path: mergedVideoPath,
      image_path: imagePath,
      audio_path: audioPath,
      duration_ms: durationMs,
      has_video: !!videoPath,
      has_image: !!imagePath,
      has_tts: !!audioPath,
      ready: !!(mergedVideoPath || videoPath || imagePath),
    };
  }));

  const renders = await prisma.generation.findMany({
    where: { shot_id: episodeShotId(epId), type: { in: ["final_video", "final_video_enhanced"] } },
    orderBy: { created_at: "desc" },
  });

  return Response.json({
    episode: { id: episode.id, number: episode.number, title: episode.title, project_id: episode.project_id },
    shots: shotSummaries,
    renders,
  });
}

// ─── POST: render a final video from a timeline ────────────────────────────
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: epId } = await params;
  const body = await req.json().catch(() => null) as {
    clips?: ClipInput[];
    fps?: number;
    width?: number;
    height?: number;
    captions?: CaptionsSetting;
  } | null;

  if (!body?.clips || body.clips.length === 0) {
    return Response.json({ error: "clips required" }, { status: 400 });
  }

  const db = await load();
  const episode = db.episodes.find((e) => e.id === epId);
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  const shotsById = new Map<string, Shot>(
    db.shots.filter((s) => s.episode_id === epId).map((s) => [s.id, s as Shot]),
  );

  // Scratch dir for image→video temp clips; cleaned up after render.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `final_img_`));
  const tempFiles: string[] = [];

  const captions = body.captions ?? { source: "off" };
  const captionStyle: CaptionStyle = {
    fontSize: captions.font_size,
    bottomPad: captions.bottom_pad,
    bgOpacity: captions.bg_opacity,
  };

  // Resolve each clip to an absolute local video path.
  // Still-image-only shots are converted to a short mp4 here so renderTimeline
  // only ever sees video inputs.
  const resolved: TimelineClip[] = [];
  try {
    for (let i = 0; i < body.clips.length; i++) {
      const c = body.clips[i];
      let src: string | null = null;
      let isImage = false;

      if (c.source === "custom" && c.custom_video_url) {
        src = c.custom_video_url;
      } else if (c.shot_id) {
        const shot = shotsById.get(c.shot_id);
        if (!shot) return Response.json({ error: `Shot ${c.shot_id} not found in this episode` }, { status: 400 });

        const videoGen = shot.approved_video_id
          ? db.generations.find((x) => x.id === shot.approved_video_id && x.status === "completed")
          : null;
        const imageGen = shot.approved_image_id
          ? db.generations.find((x) => x.id === shot.approved_image_id && x.status === "completed")
          : null;

        if (c.source === "shot_video_with_audio" && shot.video_audio_path) {
          src = shot.video_audio_path;
        } else if (c.source === "shot_video" && videoGen?.video_path) {
          src = videoGen.video_path;
        } else if (c.source === "shot_image" && imageGen?.image_path) {
          src = imageGen.image_path;
          isImage = true;
        } else {
          // Auto-pick best available source.
          if (shot.video_audio_path) src = shot.video_audio_path;
          else if (videoGen?.video_path) src = videoGen.video_path;
          else if (imageGen?.image_path) { src = imageGen.image_path; isImage = true; }
        }
      }

      if (!src) return Response.json({ error: `Clip ${i} has no resolvable source` }, { status: 400 });

      // Pull from CDN if the file isn't already on local disk.
      let localSrc: string;
      try {
        localSrc = await ensureLocalFile(src);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "file missing";
        return Response.json({ error: `Clip ${i}: ${msg}` }, { status: 400 });
      }

      let videoPath = localSrc;
      if (isImage) {
        // Pair with TTS audio if the shot has one; otherwise silent.
        const shot = c.shot_id ? shotsById.get(c.shot_id) : null;
        let audioLocal: string | null = null;
        if (shot?.audio_path) {
          try { audioLocal = await ensureLocalFile(shot.audio_path); } catch { audioLocal = null; }
        }
        const tmpOut = path.join(tempDir, `img_${i}.mp4`);
        await imageToVideo(localSrc, audioLocal, tmpOut, {
          durationMs: c.duration_ms,
          width: body.width ?? 1280,
          height: body.height ?? 720,
          fps: body.fps ?? 24,
        });
        tempFiles.push(tmpOut);
        videoPath = tmpOut;
      }

      // Resolve caption text: per-clip override wins, otherwise derive from shot
      let captionText: string | undefined = c.caption?.trim() || undefined;
      if (!captionText && captions.source !== "off" && c.shot_id) {
        const shot = shotsById.get(c.shot_id);
        const raw = captions.source === "dialogue" ? shot?.dialogue : shot?.story_line;
        if (raw && raw.trim().length > 0) captionText = raw.trim();
      }

      resolved.push({
        videoPath,
        // For image-derived clips the duration is already baked into the temp mp4,
        // so don't pass it through again (otherwise renderTimeline would trim).
        durationMs: isImage ? undefined : c.duration_ms,
        effect: c.effect ?? "none",
        transition: c.transition ?? "cut",
        transitionMs: c.transition_ms ?? 500,
        caption: captionText,
        captionStyle: captionText ? captionStyle : undefined,
      });
    }
  } catch (err) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* noop */ }
    const message = err instanceof Error ? err.message : "clip resolution failed";
    return Response.json({ error: message }, { status: 500 });
  }

  // Write output to public/generated/{projectId}/…
  const ts = Date.now();
  const filename = `episode_${epId}_final_${ts}.mp4`;
  const absDir = path.join(process.cwd(), "public", "generated", episode.project_id);
  fs.mkdirSync(absDir, { recursive: true });
  const outputPath = path.join(absDir, filename);

  try {
    await renderTimeline(resolved, {
      width: body.width ?? 1280,
      height: body.height ?? 720,
      fps: body.fps ?? 24,
      outputPath,
    });
  } catch (err) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* noop */ }
    const message = err instanceof Error ? err.message : "render failed";
    console.error("[final-video] render error:", message);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
  // (tempFiles are cleaned by rm -r of tempDir above)
  void tempFiles;

  // Upload to DO Spaces (non-blocking, non-fatal — mirrors saveGenerated)
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
      type: "final_video",
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
