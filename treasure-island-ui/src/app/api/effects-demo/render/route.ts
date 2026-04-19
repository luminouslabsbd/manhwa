import { renderTimeline, imageToVideo, type ClipEffect, type TimelineClip } from "@/lib/ffmpeg-utils";
import { ensureLocalFile, saveGenerated } from "@/lib/storage";
import path from "path";
import fs from "fs";
import os from "os";
import { createHash } from "crypto";

const EFFECTS = new Set<ClipEffect>([
  "none", "fade-in", "fade-out", "fade-both",
  "ken-burns", "zoom-in", "zoom-out",
  "pan-left", "pan-right", "pan-up", "pan-down",
  "shake",
]);

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const DEFAULT_DURATION_MS = 4000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    image_url?: string;
    effect?: ClipEffect;
    duration_ms?: number;
    caption?: string;
  } | null;

  if (!body?.image_url || !body.effect) {
    return Response.json({ error: "image_url and effect required" }, { status: 400 });
  }
  if (!EFFECTS.has(body.effect)) {
    return Response.json({ error: `unknown effect: ${body.effect}` }, { status: 400 });
  }

  const durationMs = Math.max(1500, Math.min(8000, body.duration_ms ?? DEFAULT_DURATION_MS));

  // Cache key: hash of (image_url + effect + duration + caption). Same inputs → same file.
  const key = createHash("sha1")
    .update(`${body.image_url}|${body.effect}|${durationMs}|${body.caption ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  const filename = `${body.effect}_${key}.mp4`;
  const relativePath = `/generated/effects-demo/${filename}`;
  const absDir = path.join(process.cwd(), "public", "generated", "effects-demo");
  const outputPath = path.join(absDir, filename);
  fs.mkdirSync(absDir, { recursive: true });

  // Short-circuit if we've already rendered this combination.
  if (fs.existsSync(outputPath)) {
    return Response.json({ ok: true, cached: true, video_path: relativePath, effect: body.effect });
  }

  // Resolve image source: `/generated/...` paths are looked up on disk/CDN; absolute
  // URLs are fetched directly.
  let localImagePath: string;
  try {
    if (body.image_url.startsWith("http")) {
      const res = await fetch(body.image_url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const tmpImg = path.join(os.tmpdir(), `fxdemo_src_${key}${path.extname(new URL(body.image_url).pathname) || ".png"}`);
      fs.writeFileSync(tmpImg, buf);
      localImagePath = tmpImg;
    } else {
      localImagePath = await ensureLocalFile(body.image_url);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "image fetch failed";
    return Response.json({ error: `could not load image: ${msg}` }, { status: 400 });
  }

  // Two-step: image → intermediate mp4, then renderTimeline applies the effect on that clip.
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "fxdemo_"));
  const intermediate = path.join(scratchDir, "base.mp4");

  try {
    await imageToVideo(localImagePath, null, intermediate, {
      durationMs,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
    });

    const clip: TimelineClip = {
      videoPath: intermediate,
      effect: body.effect,
      transition: "cut",
      caption: body.caption?.trim() || undefined,
      captionStyle: body.caption?.trim() ? { fontSize: 28, bottomPad: 40, bgOpacity: 0.55 } : undefined,
    };

    await renderTimeline([clip], { width: WIDTH, height: HEIGHT, fps: FPS, outputPath });
  } catch (err) {
    try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch { /* noop */ }
    const msg = err instanceof Error ? err.message : "render failed";
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch { /* noop */ }
  }

  // Mirror to DO Spaces (non-fatal).
  try {
    const buf = fs.readFileSync(outputPath);
    await saveGenerated(buf, "effects-demo", filename);
  } catch { /* local file exists */ }

  return Response.json({ ok: true, cached: false, video_path: relativePath, effect: body.effect });
}
