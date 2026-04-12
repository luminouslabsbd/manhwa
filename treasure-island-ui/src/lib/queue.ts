/**
 * BullMQ generation queue — Redis-backed, survives server restarts.
 *
 * Jobs are added when shots are queued for generation.
 * The poll route drains the queue each cycle (up to MAX_CONCURRENT concurrent ComfyUI jobs).
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";

export const MAX_CONCURRENT = 3;

function getConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
}

// Singleton queue instance
const globalForQueue = globalThis as unknown as { genQueueConn: IORedis; genQueue: Queue<GenJobData> };

function getQueue(): Queue<GenJobData> {
  if (!globalForQueue.genQueue) {
    globalForQueue.genQueueConn = getConnection();
    globalForQueue.genQueue = new Queue<GenJobData>("generation", {
      connection: globalForQueue.genQueueConn,
      defaultJobOptions: { removeOnComplete: 200, removeOnFail: 500 },
    });
  }
  return globalForQueue.genQueue;
}

export interface GenJobData {
  shot_id: string;
  project_id: string;
  model: string;
  seed: number;
  loras?: { name: string; strength: number }[];
  // Shot fields needed to build the workflow
  full_prompt: string;
  width: number;
  height: number;
  steps: number;
  // Reference image path at the time the job was queued (used for pipeline log history)
  ref_image?: string | null;
}

export async function addGenerationJob(data: GenJobData): Promise<void> {
  await getQueue().add("gen", data);
}

export async function getQueuedJobs(): Promise<GenJobData[]> {
  const jobs = await getQueue().getWaiting();
  return jobs.map(j => j.data);
}

export async function getQueueCount(): Promise<number> {
  return getQueue().getWaitingCount();
}

/**
 * Drain queue: submit up to `slots` jobs from BullMQ to ComfyUI.
 * Returns the jobs that were moved to ComfyUI (callers should create Generation records).
 *
 * @param runningCount  Number of currently in-flight image jobs
 */
export async function drainToComfyUI(runningCount: number): Promise<GenJobData[]> {
  const slots = MAX_CONCURRENT - runningCount;
  if (slots <= 0) return [];

  const queue = getQueue();
  const waiting = await queue.getWaiting(0, slots - 1);
  const taken: GenJobData[] = [];

  for (const job of waiting) {
    await job.moveToCompleted("submitted", job.token ?? "", false);
    taken.push(job.data);
  }

  return taken;
}
