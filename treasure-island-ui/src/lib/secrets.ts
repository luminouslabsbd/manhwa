import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Resolve an API key / shared secret by name.
 *
 * Lookup order:
 *   1. `app_secrets` row written by the admin Settings UI
 *   2. `process.env[name]` fallback (unchanged behaviour for existing
 *      deployments that still set these via `.env.local` / `.env.production`)
 *
 * Values are cached for 30s to keep high-traffic call sites (e.g. the RunPod
 * wrapper, which fires on every pod-list poll) from hitting the DB on every
 * request. The cache is process-local — rotating a key in the UI propagates
 * within one TTL window without needing a restart.
 */

type CacheEntry = { value: string; expiresAt: number };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/** Returns the secret value or empty string if neither DB nor env has it. */
export async function getSecret(name: string): Promise<string> {
  const hit = cache.get(name);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;

  let value = "";
  try {
    const row = await prisma.appSecret.findUnique({ where: { name }, select: { value: true } });
    if (row?.value) value = row.value;
  } catch {
    // DB might be mid-migration; fall through to env.
  }
  if (!value) value = process.env[name] ?? "";

  cache.set(name, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Synchronous fallback for module-init code paths. Only reads env — intended
 * for code that ran before the DB was reachable. Prefer the async `getSecret`.
 */
export function getSecretFromEnv(name: string): string {
  return process.env[name] ?? "";
}

/** Drop an entry so the next `getSecret` call re-reads from DB/env. */
export function invalidateSecret(name: string): void {
  cache.delete(name);
}

/** Clear the entire cache (e.g. after a bulk import). */
export function invalidateAllSecrets(): void {
  cache.clear();
}

/** Show only the last 4 chars of a value; used by the admin UI. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 8) return "•".repeat(s.length);
  return "•".repeat(Math.max(8, s.length - 4)) + s.slice(-4);
}

/**
 * Registry of well-known secret names surfaced in the Settings UI. Custom
 * names can still be created via the "Add custom" row — this list only
 * controls what the UI shows out of the box, plus per-field hints.
 */
export const KNOWN_SECRETS: Array<{
  name: string;
  label: string;
  description: string;
  placeholder?: string;
}> = [
  { name: "HF_TOKEN",          label: "Hugging Face token",      description: "hf_… — enables gated model downloads (FLUX, LTX-Video).", placeholder: "hf_..." },
  { name: "CIVITAI_TOKEN",     label: "Civitai token",           description: "Used for juggernaut / custom SDXL checkpoints.", placeholder: "ci_..." },
  { name: "RUNPOD_API_KEY",    label: "RunPod API key",          description: "Required to create / stop / delete GPU pods.", placeholder: "rpa_..." },
  { name: "OPENAI_API_KEY",    label: "OpenAI API key",          description: "Prompt generation (story / shot writers).", placeholder: "sk-..." },
  { name: "ANTHROPIC_API_KEY", label: "Anthropic API key",       description: "Prompt generation alternate provider.", placeholder: "sk-ant-..." },
  { name: "DO_SPACES_KEY",     label: "DigitalOcean Spaces key", description: "CDN upload for generated images / video.", placeholder: "DO00..." },
  { name: "DO_SPACES_SECRET",  label: "DO Spaces secret",        description: "Companion secret to DO_SPACES_KEY." },
  { name: "DOCKER_USERNAME",   label: "Docker registry user",    description: "Used by deploy.sh when pushing app images." },
  { name: "DOCKER_PASSWORD",   label: "Docker registry token",   description: "PAT / password for the Docker registry above." },
  { name: "DOCKER_REGISTRY",   label: "Docker registry URL",     description: "E.g. ghcr.io/you, docker.io, or private registry.", placeholder: "ghcr.io/you" },
];
