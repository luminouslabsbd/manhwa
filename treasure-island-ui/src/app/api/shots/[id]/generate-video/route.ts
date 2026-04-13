import { load } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { queuePrompt, buildWan2_1_I2VWorkflow, buildWan2_1_I2VWorkflow_14B, buildI2VWorkflow, uploadImage, getHost, type VideoQualityPreset, VIDEO_QUALITY_PRESETS } from "@/lib/comfyui";
import { getPodConfig } from "@/lib/pod-config";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

// Calculate frames from audio duration at 24fps
function calculateFramesFromAudio(audioDurationMs: number): number {
  const FPS = 24;
  const durationSeconds = audioDurationMs / 1000;
  const frames = Math.ceil(durationSeconds * FPS);
  // Round to nearest 8 for model compatibility
  return Math.round(frames / 8) * 8;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = await load();
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  // By default use only the most recent approved image (last in array).
  // Pass { all: true } in body to generate a video for every approved image.
  const allIds: string[] = shot.approved_image_ids?.length
    ? shot.approved_image_ids
    : shot.approved_image_id
    ? [shot.approved_image_id]
    : [];
  const approvedIds: string[] = body.all ? allIds : allIds.slice(-1);

  if (!approvedIds.length) return Response.json({ error: "No approved images" }, { status: 400 });

  // Prevent duplicate submissions — skip if a video generation is already running for this shot
  const alreadyRunning = await prisma.generation.findFirst({
    where: { shot_id: id, type: { startsWith: "video" }, status: "running" },
  });
  if (alreadyRunning) {
    return Response.json({ ok: true, queued: 0, skipped: true, reason: "Already generating" });
  }

  const host = getHost();
  const project = db.projects.find((p) => p.id === shot.project_id);
  const modelOverride = project?.pipeline_model;
  const configPreset = getPodConfig().videoQualityPreset ?? "balanced";
  const preset: VideoQualityPreset = (body.preset && body.preset in VIDEO_QUALITY_PRESETS)
    ? body.preset as VideoQualityPreset
    : configPreset;

  const seed = body.seed ?? Math.floor(Math.random() * 999999);
  let durationFrames = body.durationFrames ?? 0;

  // Auto-calculate frames from TTS audio if no explicit duration provided
  if (!durationFrames && shot.audio_path) {
    try {
      const audioAbsPath = path.join(process.cwd(), "public", shot.audio_path.replace(/^\//, ""));
      if (fs.existsSync(audioAbsPath)) {
        const buf = fs.readFileSync(audioAbsPath);
        if (buf.length >= 44) {
          const dataSize = buf.readUInt32LE(40);
          const sampleRate = buf.readUInt32LE(24);
          const channels = buf.readUInt16LE(22);
          const bitsPerSample = buf.readUInt16LE(34);
          const durationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
          if (durationMs > 500) durationFrames = calculateFramesFromAudio(durationMs);
        }
      }
    } catch { /* fall through to default */ }
  }
  if (!durationFrames) durationFrames = 144; // Default: 6 seconds at 24fps

  const queued: string[] = [];
  const errors: string[] = [];
  const genTypes: string[] = [];
  const i2vErrors: string[] = [];

  for (const approvedId of approvedIds) {
    try {
      const approvedGen = db.generations.find((g) => g.id === approvedId);
      if (!approvedGen?.image_path) { errors.push(`${approvedId}: no image path`); continue; }

      const absPath = path.join(process.cwd(), "public", approvedGen.image_path.replace(/^\//, ""));
      if (!fs.existsSync(absPath)) { errors.push(`${approvedId}: file not found`); continue; }

      let prompt_id: string | null = null;
      let genType = "video";
      let genStatus = "running";

      // Always upload image first — needed for I2V; also used by SDXL fallback
      const imgBuffer = fs.readFileSync(absPath);
      const imgName = `shot_${shot.id}_${approvedId.slice(0, 8)}.png`;

      let i2vError: string | null = null;
      let podBusy = false;
      try {
        const uploadData = await uploadImage(imgBuffer, imgName, host);

        try {
          // Try I2V 14B first (image-conditioned). Falls back if model not present.
          const wf = buildWan2_1_I2VWorkflow_14B(shot.full_prompt, uploadData.name, seed, durationFrames, preset);
          prompt_id = (await queuePrompt(wf, host)).prompt_id;
          genType = "video";
        } catch (wanErr) {
          i2vError = wanErr instanceof Error ? wanErr.message : String(wanErr);
          const msg = i2vError;
          if (msg.includes("wan2.1-i2v-14b") || msg.includes("not in list") || msg.includes("T2V") || msg.includes("t2v") || msg.includes("validation")) {
            // I2V model not available or validation failed — use T2V text-driven fallback
            const t2vWf = buildWan2_1_I2VWorkflow(shot.full_prompt, "", seed, durationFrames, modelOverride);
            prompt_id = (await queuePrompt(t2vWf, host)).prompt_id;
            genType = "video:t2v_fallback";
          } else if (msg.includes("WanVideoModelLoader") || msg.includes("missing_node_type") || msg.includes("Node 'Wan")) {
            // WanVideo nodes not installed — SDXL img2img last resort
            const fallbackWf = buildI2VWorkflow(shot.full_prompt, uploadData.name, seed, durationFrames, null);
            prompt_id = (await queuePrompt(fallbackWf, host)).prompt_id;
            genType = "video:i2v_fallback";
          } else if (msg.includes("aborted") || msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
            // ComfyUI HTTP API unresponsive (pod busy generating) — save as queued for later
            podBusy = true;
          } else {
            throw wanErr;
          }
        }
      } catch (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        if (msg.includes("aborted") || msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("pod busy")) {
          podBusy = true;
        } else {
          throw uploadErr;
        }
      }

      if (podBusy) {
        // ComfyUI is busy — save as "queued" so poll retries when it's free
        genType = "video";
        genStatus = "queued";
        prompt_id = null;
        console.warn(`[generate-video] ComfyUI busy, saving shot ${id} as queued`);
      }

      if (i2vError && !podBusy) { console.error("[generate-video] I2V failed:", i2vError.slice(0, 300)); i2vErrors.push(i2vError.slice(0, 300)); }
      console.log(`[generate-video] result: genType=${genType} genStatus=${genStatus} prompt_id=${prompt_id} podBusy=${podBusy}`);
      genTypes.push(genStatus === "queued" ? "video:queued" : genType);
      const genId = randomUUID();
      await prisma.generation.create({
        data: {
          id: genId,
          shot_id: id,
          type: genType,
          comfyui_prompt_id: prompt_id,
          status: genStatus,
          seed,
          image_path: approvedGen.image_path,
          video_path: null,
          audio_path: shot.audio_path ?? null,
          error: null,
          created_at: new Date().toISOString(),
          completed_at: null,
        },
      });
      if (prompt_id) queued.push(prompt_id);
      else if (genStatus === "queued") queued.push("queued:" + id);
    } catch (err) {
      errors.push(`${approvedId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (queued.length > 0) {
    await prisma.shot.update({ where: { id }, data: { status: "video_generating" } });
  }

  const queuedCount = queued.filter(q => !q.startsWith("queued:")).length;
  const pendingCount = queued.filter(q => q.startsWith("queued:")).length;

  return Response.json({
    ok: true,
    queued: queuedCount,
    pending: pendingCount,
    total: approvedIds.length,
    durationFrames,
    has_audio: !!shot.audio_path,
    errors: errors.length ? errors : undefined,
    _debug: { genTypes, i2vErrors: i2vErrors.length ? i2vErrors : undefined },
  });
}
