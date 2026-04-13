import { prisma } from "@/lib/prisma";
import { queuePrompt, buildWan2_1_I2VWorkflow_14B, buildWan2_1_I2VWorkflow, uploadImage, getHost } from "@/lib/comfyui";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// Read WAV header to estimate duration in milliseconds (no ffprobe needed)
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

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const episode = await prisma.episode.findUnique({ where: { id } });
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: episode.project_id } });

  // Only shots with an approved image, no approved video, and not already generating
  const shots = await prisma.shot.findMany({
    where: {
      episode_id: id,
      approved_image_id: { not: null },
      approved_video_id: null,
      status: { notIn: ["video_generating", "video_done"] },
    },
  });
  if (!shots.length) return Response.json({ ok: true, queued: 0, message: "No shots ready for video" });

  const host = getHost();
  let queued = 0;
  const errors: string[] = [];

  for (const shot of shots) {
    try {
      // Skip if already has a running video generation
      const existingRunning = await prisma.generation.findFirst({
        where: { shot_id: shot.id, type: { startsWith: "video" }, status: "running" },
      });
      if (existingRunning) { errors.push(`Shot ${shot.shot_number}: already generating`); continue; }

      const approvedGen = await prisma.generation.findUnique({ where: { id: shot.approved_image_id! } });
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

      let prompt_id: string;
      try {
        const wf = buildWan2_1_I2VWorkflow_14B(shot.full_prompt, uploadData.name, seed, durationFrames);
        prompt_id = (await queuePrompt(wf, host)).prompt_id;
      } catch {
        const wf = buildWan2_1_I2VWorkflow(shot.full_prompt, uploadData.name, seed, durationFrames, project?.pipeline_model);
        prompt_id = (await queuePrompt(wf, host)).prompt_id;
      }

      await prisma.generation.create({
        data: {
          id: randomUUID(), shot_id: shot.id, type: "video",
          comfyui_prompt_id: prompt_id, status: "running", seed,
          image_path: approvedGen.image_path, video_path: null,
          audio_path: shot.audio_path ?? null, voice: null,
          error: null, created_at: new Date().toISOString(), completed_at: null,
        },
      });
      await prisma.shot.update({ where: { id: shot.id }, data: { status: "video_generating" } });
      queued++;
    } catch (e) {
      errors.push(`Shot ${shot.shot_number}: ${String(e)}`);
    }
  }

  return Response.json({ ok: true, queued, total: shots.length, errors });
}
