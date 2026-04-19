import { getHistory, fetchImageAsBase64, uploadImage, queuePrompt, buildLTX2_I2VWorkflow, getHost } from "@/lib/comfyui";
import { mergeAudioVideo } from "@/lib/ffmpeg-utils";
import { drainQueue } from "@/lib/gen-queue";
import { prisma } from "@/lib/prisma";
import { saveGenerated, readGenerated, generatedExists } from "@/lib/storage";
import fs from "fs";
import path from "path";

const BATCH_SIZE = 20;
const STALE_TIMEOUT_MS = 10 * 60 * 1000;

export async function GET() {
  const host = getHost();

  // Load only running generations directly from Prisma
  const running = await prisma.generation.findMany({
    where: { status: "running", comfyui_prompt_id: { not: null } },
    take: BATCH_SIZE,
  });

  if (!running.length) {
    // Still check for queued generations to retry
    let retried = 0;
    try {
      const queued = await prisma.generation.findMany({
        where: { status: "queued", type: { startsWith: "video" }, comfyui_prompt_id: null },
        take: 5,
      });
      for (const gen of queued) {
        try {
          const shot = await prisma.shot.findUnique({
            where: { id: gen.shot_id },
            select: { full_prompt: true, audio_path: true },
          });
          if (!shot || !gen.image_path) continue;
          let durationFrames = 144;
          if (shot.audio_path) {
            try {
              const audioAbsPath = path.join(process.cwd(), "public", shot.audio_path.replace(/^\//, ""));
              if (generatedExists(shot.audio_path)) {
                const buf = readGenerated(shot.audio_path);
                if (buf.length >= 44) {
                  const dataSize = buf.readUInt32LE(40);
                  const sampleRate = buf.readUInt32LE(24);
                  const channels = buf.readUInt16LE(22);
                  const bitsPerSample = buf.readUInt16LE(34);
                  const durationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
                  if (durationMs > 500) durationFrames = Math.round(Math.ceil(durationMs / 1000 * 24) / 8) * 8;
                }
              }
            } catch { /* use default */ }
          }
          if (!generatedExists(gen.image_path)) continue;
          const imgBuffer = readGenerated(gen.image_path);
          const imgName = `shot_${gen.shot_id}_${gen.id.slice(0, 8)}.png`;
          const uploadData = await uploadImage(imgBuffer, imgName, host);
          const wf = buildLTX2_I2VWorkflow(shot.full_prompt, uploadData.name, gen.seed ?? 42, durationFrames);
          const prompt_id = (await queuePrompt(wf, host)).prompt_id;
          await prisma.generation.update({
            where: { id: gen.id },
            data: { status: "running", comfyui_prompt_id: prompt_id },
          });
          retried++;
        } catch { /* ComfyUI still busy — leave as queued */ }
      }
    } catch { /* DB error */ }
    const drained = await drainQueue().catch(() => 0);
    return Response.json({ completed: [], checked: 0, drained, retried });
  }

  // Fetch full ComfyUI history + queue once
  let fullHistory: Record<string, unknown> = {};
  let queuedPromptIds = new Set<string>();
  try {
    const [histRes, queueRes] = await Promise.all([
      fetch(`${host}/history`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
      fetch(`${host}/queue`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    ]);
    fullHistory = histRes ?? {};
    const queueRunning: unknown[][] = queueRes?.queue_running ?? [];
    const queuePending: unknown[][] = queueRes?.queue_pending ?? [];
    for (const item of [...queueRunning, ...queuePending]) {
      if (Array.isArray(item) && item[1]) queuedPromptIds.add(String(item[1]));
    }
  } catch { /* ComfyUI unreachable — skip this poll */ }

  const completed: string[] = [];
  const now = Date.now();

  for (const gen of running) {
    try {
      const pid = gen.comfyui_prompt_id!;
      const entry = fullHistory[pid] as Record<string, unknown> | undefined;

      // Not in history and not in queue → possibly stale
      if (!entry) {
        if (!queuedPromptIds.has(pid)) {
          const age = now - new Date(gen.created_at).getTime();
          if (age > STALE_TIMEOUT_MS) {
            await prisma.generation.update({
              where: { id: gen.id },
              data: { status: "failed", error: "Prompt not found in ComfyUI (pod restarted?)" },
            });
            // Update shot status only if it's still generating
            await prisma.shot.updateMany({
              where: { id: gen.shot_id, status: { in: ["generating", "video_generating"] } },
              data: { status: "failed" },
            });
            // Also check characters
            await prisma.character.updateMany({
              where: { id: gen.shot_id, status: "generating" },
              data: { status: "failed" },
            });
          }
        }
        continue;
      }

      const st = entry.status as { status_str?: string; completed?: boolean; messages?: unknown[] } | undefined;

      if (st?.status_str === "error") {
        let errorMsg = "ComfyUI error";
        const messages = st?.messages ?? [];
        for (const m of messages) {
          if (Array.isArray(m) && m.length > 1 && typeof m[1] === "object" && m[1] !== null) {
            const msg = m[1] as Record<string, unknown>;
            if (msg.exception_message) {
              const nodeType = msg.node_type ? ` [${msg.node_type}]` : "";
              errorMsg = `${msg.exception_message}${nodeType}`;
              break;
            }
          }
        }
        await prisma.generation.update({
          where: { id: gen.id },
          data: { status: "failed", error: errorMsg.slice(0, 500) },
        });
        await prisma.shot.updateMany({
          where: { id: gen.shot_id, status: { in: ["generating", "video_generating"] } },
          data: { status: "failed" },
        });
        continue;
      }

      if (!st?.completed) continue;

      // Determine parent context
      const isBaseImage = gen.type === "base_image" && gen.shot_id.startsWith("base_");
      const baseProjectId = isBaseImage ? gen.shot_id.replace("base_", "") : null;

      let projectId: string | null = baseProjectId;
      if (!projectId) {
        // Could be a shot or a character generation
        const shot = await prisma.shot.findUnique({ where: { id: gen.shot_id }, select: { project_id: true } });
        if (shot) {
          projectId = shot.project_id;
        } else {
          const char = await prisma.character.findUnique({ where: { id: gen.shot_id }, select: { project_id: true } });
          projectId = char?.project_id ?? null;
        }
      }
      if (!projectId) continue;

      const outputs = entry.outputs ?? {};
      for (const nodeOut of Object.values(outputs) as Record<string, unknown>[]) {
        // ── Image outputs ──
        for (const img of ((nodeOut.images ?? []) as Array<{ filename: string; subfolder: string }>)) {
          const buf = await fetchImageAsBase64(img.filename, img.subfolder, host);
          const fname = isBaseImage ? "base.png" : `${gen.id}.png`;
          const filePath = await saveGenerated(buf, projectId, fname);

          await prisma.generation.update({
            where: { id: gen.id },
            data: { status: "completed", image_path: filePath, completed_at: new Date().toISOString() },
          });

          if (isBaseImage) {
            const comfyName = `base_${projectId}.png`;
            const uploadData = await uploadImage(buf, comfyName, host);
            await prisma.project.update({
              where: { id: projectId },
              data: { base_image_path: filePath, base_image_comfyui: uploadData.name },
            });
          } else {
            if (gen.type.startsWith("video:")) {
              // i2v fallback — produced a still image, not a real video; reset to "done"
              await prisma.shot.updateMany({
                where: { id: gen.shot_id },
                data: { status: "done" },
              });
            } else {
              // Standard shot image generation
              await prisma.shot.updateMany({
                where: { id: gen.shot_id, status: { in: ["generating", "done"] } },
                data: { status: "done" },
              });
              // Character generation — always update latest image, no status gate
              await prisma.character.updateMany({
                where: { id: gen.shot_id },
                data: { status: "done", reference_image: filePath },
              });
            }
          }

          // Frame update
          const frameMatch = gen.type.match(/:frame:([a-z0-9-]+)$/);
          if (frameMatch) {
            await prisma.frame.update({
              where: { id: frameMatch[1] },
              data: { image_path: filePath, status: "done" },
            }).catch(() => {});
          }

          completed.push(gen.shot_id);
        }

        // ── Video outputs ──
        for (const vid of ((nodeOut.gifs ?? []) as Array<{ filename: string; subfolder: string }>)) {
          const buf = await fetchImageAsBase64(vid.filename, vid.subfolder, host);
          const fname = `${gen.id}.mp4`;
          const videoPath = await saveGenerated(buf, projectId, fname);

          await prisma.generation.update({
            where: { id: gen.id },
            data: { status: "completed", video_path: videoPath, completed_at: new Date().toISOString() },
          });

          // Auto-merge audio+video if audio exists
          const shot = await prisma.shot.findUnique({ where: { id: gen.shot_id }, select: { audio_path: true, video_audio_path: true } });
          let videoAudioPath: string | null = null;
          if (shot?.audio_path && !shot.video_audio_path) {
            try {
              const audioAbsPath = path.join(process.cwd(), "public", shot.audio_path.replace(/^\//, ""));
              const videoAbsPath = path.join(process.cwd(), "public", videoPath.replace(/^\//, ""));
              if (fs.existsSync(audioAbsPath) && fs.existsSync(videoAbsPath)) {
                videoAudioPath = await mergeAudioVideo(videoAbsPath, audioAbsPath);
              }
            } catch { /* ffmpeg not available */ }
          }

          await prisma.shot.update({
            where: { id: gen.shot_id },
            data: { status: "video_done", ...(videoAudioPath ? { video_audio_path: videoAudioPath } : {}) },
          });

          completed.push(gen.shot_id);
        }
      }
    } catch { /* timeout or error on this gen — skip and try next poll */ }
  }

  // ── Retry queued video generations (saved when ComfyUI was busy) ──
  let retried = 0;
  try {
    const queued = await prisma.generation.findMany({
      where: { status: "queued", type: { startsWith: "video" }, comfyui_prompt_id: null },
      take: 5,
    });
    for (const gen of queued) {
      try {
        const shot = await prisma.shot.findUnique({
          where: { id: gen.shot_id },
          select: { full_prompt: true, audio_path: true, project_id: true },
        });
        if (!shot || !gen.image_path) continue;

        // Recalculate durationFrames from audio if available
        let durationFrames = 144;
        if (shot.audio_path) {
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
                if (durationMs > 500) durationFrames = Math.round(Math.ceil(durationMs / 1000 * 24) / 8) * 8;
              }
            }
          } catch { /* use default */ }
        }

        const imgAbsPath = path.join(process.cwd(), "public", gen.image_path.replace(/^\//, ""));
        if (!fs.existsSync(imgAbsPath)) continue;

        const imgBuffer = fs.readFileSync(imgAbsPath);
        const imgName = `shot_${gen.shot_id}_${gen.id.slice(0, 8)}.png`;
        const uploadData = await uploadImage(imgBuffer, imgName, host);

        const wf = buildLTX2_I2VWorkflow(shot.full_prompt, uploadData.name, gen.seed ?? 42, durationFrames);
        const prompt_id = (await queuePrompt(wf, host)).prompt_id;

        await prisma.generation.update({
          where: { id: gen.id },
          data: { status: "running", comfyui_prompt_id: prompt_id },
        });
        retried++;
      } catch { /* ComfyUI still busy or error — leave as queued for next poll */ }
    }
  } catch { /* skip queued retry on DB error */ }

  const drained = await drainQueue().catch(() => 0);

  return Response.json({ completed, checked: running.length, remaining: 0, drained, retried });
}
