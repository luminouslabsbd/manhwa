/**
 * Storage abstraction — writes to local disk AND uploads to DO Spaces when configured.
 * image_path / video_path in the DB are always stored as relative `/generated/...` paths.
 * toPublicUrl() converts them to CDN URLs at render time when DO Spaces is configured.
 */

import fs from "fs";
import path from "path";

// ── Config ──────────────────────────────────────────────────────────────────

function spacesConfig() {
  const key    = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const bucket = process.env.DO_SPACES_BUCKET;
  const region = process.env.DO_SPACES_REGION ?? "sgp1";
  const prefix = process.env.DO_SPACES_PREFIX ?? "manhwa-studio";
  if (!key || !secret || !bucket) return null;
  return { key, secret, bucket, region, prefix,
    endpoint: `https://${region}.digitaloceanspaces.com`,
    cdnBase: `https://${bucket}.${region}.digitaloceanspaces.com/${prefix}` };
}

// ── Public URL ───────────────────────────────────────────────────────────────

/** Convert a `/generated/...` path to a full CDN URL (or return as-is for local). */
export function toPublicUrl(filePath: string): string {
  const cfg = spacesConfig();
  if (!cfg || !filePath) return filePath;
  // Already a full URL
  if (filePath.startsWith("http")) return filePath;
  return `${cfg.cdnBase}${filePath}`;
}

/** Convert a URL or relative path to a local absolute filesystem path. */
export function toLocalPath(filePathOrUrl: string): string {
  if (!filePathOrUrl) return filePathOrUrl;
  // Strip CDN prefix if present
  const cfg = spacesConfig();
  if (cfg && filePathOrUrl.startsWith(cfg.cdnBase)) {
    filePathOrUrl = filePathOrUrl.slice(cfg.cdnBase.length);
  }
  if (filePathOrUrl.startsWith("http")) return filePathOrUrl; // external, can't localise
  return path.join(process.cwd(), "public", filePathOrUrl.replace(/^\//, ""));
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadToSpaces(buf: Buffer, relativePath: string): Promise<void> {
  const cfg = spacesConfig();
  if (!cfg) return;

  // Lazy-import AWS SDK v3 (only available if installed)
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.key, secretAccessKey: cfg.secret },
      forcePathStyle: false,
    });
    const key = `${cfg.prefix}${relativePath}`;
    const ext = path.extname(relativePath).toLowerCase();
    const contentType =
      ext === ".png"  ? "image/png"  :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".mp4"  ? "video/mp4"  :
      ext === ".wav"  ? "audio/wav"  :
      "application/octet-stream";

    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buf,
      ACL: "public-read",
      ContentType: contentType,
    }));
  } catch {
    // Non-fatal — local file is already saved
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Save a generated file:
 * 1. Writes to local disk under public/generated/...
 * 2. Uploads to DO Spaces in the background (non-blocking, non-fatal)
 * Returns the relative path e.g. `/generated/projectId/genId.png`
 */
export async function saveGenerated(
  buf: Buffer,
  projectId: string,
  filename: string
): Promise<string> {
  const relativePath = `/generated/${projectId}/${filename}`;
  const absDir = path.join(process.cwd(), "public", "generated", projectId);
  fs.mkdirSync(absDir, { recursive: true });
  fs.writeFileSync(path.join(absDir, filename), buf);

  // Upload to Spaces in background — don't await, failure is non-fatal
  uploadToSpaces(buf, relativePath).catch(() => {});

  return relativePath;
}

/**
 * Read a file from local disk (resolves both relative paths and CDN URLs via local copy).
 */
export function readGenerated(filePathOrUrl: string): Buffer {
  return fs.readFileSync(toLocalPath(filePathOrUrl));
}

/**
 * Upload an already-written `/generated/...` file from local disk to DO Spaces.
 * Used by flows that write via ffmpeg directly (e.g. mergeAudioVideo) so the
 * result is reachable via the CDN on other hosts. No-ops if Spaces isn't configured.
 */
export async function uploadGeneratedFromDisk(relativePath: string): Promise<void> {
  if (!spacesConfig()) return;
  const localPath = toLocalPath(relativePath);
  if (!fs.existsSync(localPath)) return;
  const buf = fs.readFileSync(localPath);
  await uploadToSpaces(buf, relativePath);
}

export function generatedExists(filePathOrUrl: string): boolean {
  try { return fs.existsSync(toLocalPath(filePathOrUrl)); }
  catch { return false; }
}

/**
 * Fetch a generated file as a Buffer. Tries local disk first, falls back to CDN
 * when the file isn't present locally (e.g. running dev against a prod DB where
 * assets live only on DO Spaces). Throws a descriptive error if neither works.
 */
export async function fetchGenerated(filePathOrUrl: string): Promise<Buffer> {
  const localPath = toLocalPath(filePathOrUrl);
  if (fs.existsSync(localPath)) return fs.readFileSync(localPath);

  const cdnUrl = toPublicUrl(filePathOrUrl);
  if (!cdnUrl.startsWith("http")) {
    throw new Error(`file not found locally and no CDN configured: ${filePathOrUrl}`);
  }
  const res = await fetch(cdnUrl);
  if (!res.ok) {
    throw new Error(`file not found locally and CDN returned ${res.status}: ${filePathOrUrl}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Resolve a `/generated/...` path to an absolute local filesystem path, downloading
 * from the DO Spaces CDN into `public/generated/...` if it's not already present.
 * Returns the local path. Use this whenever a server-side tool (ffmpeg etc.) needs
 * the file on disk. The download doubles as a local cache for later requests.
 */
export async function ensureLocalFile(filePathOrUrl: string): Promise<string> {
  const localPath = toLocalPath(filePathOrUrl);
  if (fs.existsSync(localPath)) return localPath;

  const cdnUrl = toPublicUrl(filePathOrUrl);
  if (!cdnUrl.startsWith("http")) {
    throw new Error(`file not found locally and no CDN configured: ${filePathOrUrl}`);
  }
  const res = await fetch(cdnUrl);
  if (!res.ok) {
    throw new Error(`file not found locally and CDN returned ${res.status}: ${filePathOrUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buf);
  return localPath;
}
