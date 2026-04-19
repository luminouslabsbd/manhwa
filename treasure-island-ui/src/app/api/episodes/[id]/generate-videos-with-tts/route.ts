import { prisma } from "@/lib/prisma";
import { queuePrompt, buildWan2_1_I2VWorkflow, uploadImage, getVideoHost } from "@/lib/comfyui";
import { generateSpeech } from "@/lib/tts";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

function wavDurationMs(absPath: string): number {
  try {
    const buf = fs.readFileSync(absPath);
    if (buf.length < 44) return 0;
    const dataSize = buf.readUInt32LE(40);
    const sampleRate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    const bitsPerSample = buf.readUInt16LE(34);
    const ms = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
    return ms > 0 ? ms : 0;
  } catch { return 0; }
}

function framesFromMs(ms: number): number {
  const frames = Math.ceil((ms / 1000) * 24);
  return Math.round(frames / 8) * 8 || 144;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = await params;
  const body = await req.json().catch(() => ({}));
  const { ttsOnly = false, selectedShotIds, voice = "default" } = body as {
    ttsOnly?: boolean;
    selectedShotIds?: string[];
    voice?: string;
  };

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: episode.project_id } });
  const modelOverride = project?.pipeline_model ?? null;

  const shots = await prisma.shot.findMany({
    where: {
      episode_id: episodeId,
      ...(selectedShotIds?.length ? { id: { in: selectedShotIds } } : {}),
    },
  });

  const host = getVideoHost();
  let ttsGenerated = 0;
  let videosQueued = 0;
  const errors: string[] = [];

  for (const shot of shots) {
    // Step 1: Generate TTS if shot has dialogue (fallback: story_line) and no audio yet
    const ttsText = shot.dialogue?.trim() || shot.story_line?.trim() || "";
    if (ttsText && !shot.audio_path) {
      try {
        const result = await generateSpeech(ttsText, { voice, language: "en" });
        const now = new Date().toISOString();
        await prisma.generation.create({
          data: {
            id: randomUUID(), shot_id: shot.id, type: "tts",
            comfyui_prompt_id: null, status: "completed", seed: null,
            image_path: null, video_path: null,
            audio_path: result.audio_path, voice,
            error: null,
            created_at: now, completed_at: now,
          },
        });
        await prisma.shot.update({
          where: { id: shot.id },
          data: { audio_path: result.audio_path, status: "tts_done" },
        });
        shot.audio_path = result.audio_path;
        shot.status = "tts_done";
        ttsGenerated++;
      } catch (e) {
        errors.push(`Shot ${shot.shot_number} TTS: ${String(e)}`);
      }
    }

    // Step 2: Queue video generation if shot has an approved image (and we're not ttsOnly)
    if (!ttsOnly && shot.approved_image_id) {
      try {
        const approvedGen = await prisma.generation.findUnique({ where: { id: shot.approved_image_id } });
        if (!approvedGen?.image_path) { errors.push(`Shot ${shot.shot_number}: No image path`); continue; }

        const absPath = path.join(process.cwd(), "public", approvedGen.image_path.replace(/^\//, ""));
        if (!fs.existsSync(absPath)) { errors.push(`Shot ${shot.shot_number}: Image file missing`); continue; }

        let durationFrames = 144;
        if (shot.audio_path) {
          const audioAbsPath = path.join(process.cwd(), "public", shot.audio_path.replace(/^\//, ""));
          if (fs.existsSync(audioAbsPath)) {
            const ms = wavDurationMs(audioAbsPath);
            if (ms > 500) durationFrames = framesFromMs(ms);
          }
        }

        const imgBuffer = fs.readFileSync(absPath);
        const imgName = `shot_${shot.id}.png`;
        const uploadData = await uploadImage(imgBuffer, imgName, host);
        const seed = Math.floor(Math.random() * 999999);
        const wf = buildWan2_1_I2VWorkflow(shot.full_prompt, uploadData.name, seed, durationFrames, modelOverride);
        const { prompt_id } = await queuePrompt(wf, host);

        const now = new Date().toISOString();
        await prisma.generation.create({
          data: {
            id: randomUUID(), shot_id: shot.id, type: "video",
            comfyui_prompt_id: prompt_id, status: "running", seed,
            image_path: approvedGen.image_path, video_path: null,
            audio_path: shot.audio_path ?? null, voice: null,
            error: null,
            created_at: now, completed_at: null,
          },
        });
        await prisma.shot.update({ where: { id: shot.id }, data: { status: "video_generating" } });
        videosQueued++;
      } catch (e) {
        errors.push(`Shot ${shot.shot_number} Video: ${String(e)}`);
      }
    }
  }

  return Response.json({
    ok: true,
    tts_generated: ttsGenerated,
    videos_queued: videosQueued,
    total_shots: shots.length,
    errors: errors.length ? errors : undefined,
  });
}
