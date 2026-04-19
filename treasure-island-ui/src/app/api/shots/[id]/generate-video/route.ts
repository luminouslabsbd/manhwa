import { load } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { queuePrompt, buildLTX2_I2VWorkflow, buildI2VWorkflow, uploadImage, getVideoHost, resolveAvailableCheckpoint, type VideoQualityPreset, VIDEO_QUALITY_PRESETS } from "@/lib/comfyui";
import { getPodConfig } from "@/lib/pod-config";
import { fetchGenerated } from "@/lib/storage";
import { randomUUID } from "crypto";

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

  const host = getVideoHost();
  const project = db.projects.find((p) => p.id === shot.project_id);
  const modelOverride = project?.pipeline_model;
  const podCfg = getPodConfig();
  const configPreset = podCfg.videoQualityPreset ?? "balanced";
  const preset: VideoQualityPreset = (body.preset && body.preset in VIDEO_QUALITY_PRESETS)
    ? body.preset as VideoQualityPreset
    : configPreset;

  const seed = body.seed ?? Math.floor(Math.random() * 999999);
  let durationFrames = body.durationFrames ?? 0;

  // Auto-calculate frames from TTS audio if no explicit duration provided
  if (!durationFrames && shot.audio_path) {
    try {
      const buf = await fetchGenerated(shot.audio_path);
      if (buf.length >= 44) {
        const dataSize = buf.readUInt32LE(40);
        const sampleRate = buf.readUInt32LE(24);
        const channels = buf.readUInt16LE(22);
        const bitsPerSample = buf.readUInt16LE(34);
        const durationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
        if (durationMs > 500) durationFrames = calculateFramesFromAudio(durationMs);
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

      let imgBuffer: Buffer;
      try {
        imgBuffer = await fetchGenerated(approvedGen.image_path);
      } catch (e) {
        errors.push(`${approvedId}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      let prompt_id: string | null = null;
      let genType = "video";
      let genStatus = "running";

      // Always upload image first — needed for I2V; also used by SDXL fallback
      const imgName = `shot_${shot.id}_${approvedId.slice(0, 8)}.png`;

      let i2vError: string | null = null;
      let podBusy = false;
      try {
        const uploadData = await uploadImage(imgBuffer, imgName, host);

        try {
          const wf = buildLTX2_I2VWorkflow(shot.full_prompt, uploadData.name, seed, durationFrames, preset);
          prompt_id = (await queuePrompt(wf, host)).prompt_id;
          genType = "video:ltx2";
        } catch (ltxErr) {
          i2vError = ltxErr instanceof Error ? ltxErr.message : String(ltxErr);
          const msg = i2vError;
          if (msg.includes("ltxv-13b") || msg.includes("not in list") || msg.includes("missing_node_type") || msg.includes("validation") || msg.includes("LTXV")) {
            // LTX model or nodes unavailable — SDXL img2img last resort.
            // Query the pod's actual checkpoint catalog so we don't hit "value_not_in_list"
            // when the env default (e.g. flux1-schnell) isn't loaded on an SDXL-only pod.
            const ckpt = await resolveAvailableCheckpoint(modelOverride, host);
            const fallbackWf = buildI2VWorkflow(shot.full_prompt, uploadData.name, seed, durationFrames, ckpt);
            prompt_id = (await queuePrompt(fallbackWf, host)).prompt_id;
            genType = "video:i2v_fallback";
          } else if (msg.includes("aborted") || msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
            // ComfyUI HTTP API unresponsive (pod busy generating) — save as queued for later
            podBusy = true;
          } else {
            throw ltxErr;
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
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${approvedId}: ${errMsg}`);
      // Persist a failed generation record so the UI shows a visible failure tile
      // instead of the spinner silently disappearing with no trace.
      try {
        const approvedGen = db.generations.find((g) => g.id === approvedId);
        await prisma.generation.create({
          data: {
            id: randomUUID(),
            shot_id: id,
            type: "video",
            comfyui_prompt_id: null,
            status: "failed",
            seed,
            image_path: approvedGen?.image_path ?? null,
            video_path: null,
            audio_path: shot.audio_path ?? null,
            error: errMsg.slice(0, 500),
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          },
        });
      } catch { /* best-effort */ }
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
