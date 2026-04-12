/**
 * Generation queue drain — pulls pending jobs from BullMQ and submits to ComfyUI.
 *
 * Called from the poll route after processing completions to keep the pipeline moving.
 * MAX_CONCURRENT jobs are allowed in-flight at once.
 */

import { queuePrompt, buildImageWorkflow, buildShotFromBaseWorkflow, uploadImage, getHost, type LoraSpec } from "@/lib/comfyui";
import { addGenerationJob, getQueueCount, MAX_CONCURRENT, type GenJobData } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";

export { MAX_CONCURRENT, addGenerationJob };

/** Resolve a local image path to a ComfyUI filename (upload if needed) */
async function resolveRefImage(refImage: string, host: string): Promise<string> {
  if (!refImage.includes("/")) return refImage;
  const localPath = path.join(process.cwd(), "public", refImage);
  const buf = readFileSync(localPath);
  const result = await uploadImage(Buffer.from(buf), path.basename(refImage), host);
  return result.name;
}

/**
 * Submit one job to ComfyUI. Returns the prompt_id or throws.
 */
async function submitJob(job: GenJobData, refImage: string | null, host: string): Promise<string> {
  const loras = job.loras as LoraSpec[] | undefined;
  if (refImage) {
    try {
      const wf = buildShotFromBaseWorkflow(job.full_prompt, refImage, job.seed, job.width, job.height, job.steps, job.model, true, loras);
      return (await queuePrompt(wf, host)).prompt_id;
    } catch {
      const wf = buildShotFromBaseWorkflow(job.full_prompt, refImage, job.seed, job.width, job.height, job.steps, job.model, false, loras);
      return (await queuePrompt(wf, host)).prompt_id;
    }
  } else {
    const wf = buildImageWorkflow(job.full_prompt, job.seed, job.width, job.height, job.steps, job.model, loras);
    return (await queuePrompt(wf, host)).prompt_id;
  }
}

/**
 * Drain the BullMQ queue — submit jobs to ComfyUI up to MAX_CONCURRENT.
 * Directly mutates the PostgreSQL DB (creates Generation records).
 * Returns number of new jobs submitted.
 */
export async function drainQueue(): Promise<number> {
  const queueCount = await getQueueCount();
  if (queueCount === 0) return 0;

  // Count currently running image generations
  const runningCount = await prisma.generation.count({
    where: { status: "running", type: { startsWith: "image" } },
  });

  const slots = MAX_CONCURRENT - runningCount;
  if (slots <= 0) return 0;

  const host = getHost();

  // Pull up to `slots` pending jobs from BullMQ
  const { Queue } = await import("bullmq");
  const IORedis = (await import("ioredis")).default;
  const conn = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const q = new Queue<GenJobData>("generation", { connection: conn });
  const waiting = await q.getWaiting(0, slots - 1);

  // Per-project ref image cache
  const refCache: Record<string, string | null> = {};
  async function getRefImage(projectId: string): Promise<string | null> {
    if (projectId in refCache) return refCache[projectId];
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { base_image_path: true } });
    const raw = proj?.base_image_path ?? null;
    if (!raw) { refCache[projectId] = null; return null; }
    try { refCache[projectId] = await resolveRefImage(raw, host); }
    catch { refCache[projectId] = null; }
    return refCache[projectId];
  }

  let submitted = 0;
  for (const job of waiting) {
    try {
      // Use ref_image stored at queue time if available, otherwise fall back to project base image
      let resolvedRefImage: string | null = null;
      if (job.data.ref_image) {
        try { resolvedRefImage = await resolveRefImage(job.data.ref_image, host); }
        catch { resolvedRefImage = null; }
      } else {
        resolvedRefImage = await getRefImage(job.data.project_id);
      }
      const prompt_id = await submitJob(job.data, resolvedRefImage, host);

      await prisma.generation.create({
        data: {
          id: randomUUID(),
          shot_id: job.data.shot_id,
          type: `image:${job.data.model}`,
          comfyui_prompt_id: prompt_id,
          status: "running",
          seed: job.data.seed,
          image_path: null,
          video_path: null,
          error: null,
          ref_image: job.data.ref_image ?? null,
          created_at: new Date().toISOString(),
          completed_at: null,
        },
      });

      await prisma.shot.update({
        where: { id: job.data.shot_id },
        data: { status: "generating" },
      });

      await job.moveToCompleted("submitted", job.token ?? "", false);
      submitted++;
    } catch {
      // Leave in queue — ComfyUI may be temporarily unreachable
    }
  }

  await conn.quit();
  return submitted;
}
