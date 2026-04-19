import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Binaries can be overridden via env. Useful on macOS where the stock Homebrew
// `ffmpeg` bottle omits `libfreetype` (no drawtext filter) — set FFMPEG_PATH
// to e.g. `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` to enable captions.
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

export interface MergeOptions {
  audioStartTime?: number; // ms to start audio (default 0)
  videoScale?: string; // e.g. "1280:720" (default: keep original)
  audioCodec?: string; // default: aac
  videoCodec?: string; // default: h264
  bitrate?: string; // default: 5M
  overwrite?: boolean; // default: true
}

/**
 * Merge audio and video files using ffmpeg
 * @param videoPath - Path to video file
 * @param audioPath - Path to audio file
 * @param options - Merge options
 * @returns Promise with output file path
 */
export async function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  options: MergeOptions = {}
): Promise<string> {
  const {
    audioStartTime = 0,
    videoScale,
    audioCodec = 'aac',
    videoCodec = 'h264',
    bitrate = '5M',
    overwrite = true,
  } = options;

  // Validate inputs
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Generate output filename
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const outputPath = path.join(dir, `${baseName}_with_audio.mp4`);

  // Clean up existing file if overwrite enabled
  if (overwrite && fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  return new Promise((resolve, reject) => {
    // Build ffmpeg command
    const args = [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', videoCodec,
      '-c:a', audioCodec,
      '-b:v', bitrate,
      '-y', // Overwrite output
      outputPath,
    ];

    // Add scaling if specified
    if (videoScale) {
      args.splice(args.indexOf('-c:v'), 0, '-vf', `scale=${videoScale}`);
    }

    // Add audio sync options
    args.push(
      '-shortest', // End at shortest stream
      '-fflags', '+igndts', // Ignore DTS (helps with sync)
      '-async', '1' // Audio sync tolerance
    );

    console.log('[FFMPEG] Executing:', `ffmpeg ${args.join(' ')}`);

    const ffmpeg = spawn(FFMPEG_BIN, args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      // Print progress
      const progressMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (progressMatch) {
        const [, h, m, s] = progressMatch;
        process.stdout.write(`\r[FFMPEG] Progress: ${h}:${m}:${s}`);
      }
    });

    ffmpeg.on('close', (code) => {
      console.log(''); // New line after progress
      if (code !== 0) {
        reject(new Error(`FFmpeg merge failed with code ${code}: ${stderr}`));
        return;
      }

      if (!fs.existsSync(outputPath)) {
        reject(new Error(`Output file was not created: ${outputPath}`));
        return;
      }

      // Return URL path relative to public/ so Next.js can serve it
      const relativePath = "/" + path.relative(path.join(process.cwd(), "public"), outputPath).replace(/\\/g, "/");
      resolve(relativePath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Extract audio from video file
 * @param videoPath - Path to video file
 * @param outputPath - Optional output path (default: same name with .wav)
 */
export async function extractAudio(
  videoPath: string,
  outputPath?: string
): Promise<string> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const outPath = outputPath || path.join(
    path.dirname(videoPath),
    `${path.basename(videoPath, path.extname(videoPath))}.wav`
  );

  return new Promise((resolve, reject) => {
    const args = [
      '-i', videoPath,
      '-vn', // No video
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '2',
      '-y',
      outPath,
    ];

    const ffmpeg = spawn(FFMPEG_BIN, args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Audio extraction failed: ${stderr}`));
        return;
      }

      if (!fs.existsSync(outPath)) {
        reject(new Error(`Output audio file not created: ${outPath}`));
        return;
      }

      resolve(outPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

/**
 * Get video duration in milliseconds
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    const ffprobe = spawn(FFPROBE_BIN, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);

    let output = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with code ${code}`));
        return;
      }

      const durationSeconds = parseFloat(output.trim());
      if (isNaN(durationSeconds)) {
        reject(new Error(`Could not parse duration: ${output}`));
        return;
      }

      resolve(Math.round(durationSeconds * 1000)); // Convert to ms
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}

/**
 * Get audio duration in milliseconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  return getVideoDuration(audioPath); // ffprobe works for audio too
}

/**
 * Trim the last N seconds from a video to remove end-frame glitches.
 * Overwrites the file in place. No-ops if video is shorter than trimSecs * 2.
 */
export async function trimVideoEnd(videoPath: string, trimSecs = 0.3): Promise<void> {
  const durationMs = await getVideoDuration(videoPath).catch(() => 0);
  if (!durationMs || durationMs < trimSecs * 2 * 1000) return;
  const newDuration = (durationMs / 1000) - trimSecs;
  const tmpPath = videoPath.replace(/\.mp4$/, '_trim.mp4');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      '-y', '-i', videoPath,
      '-t', String(newDuration.toFixed(3)),
      '-c', 'copy',
      tmpPath,
    ]);
    proc.on('close', (code) => {
      if (code === 0) { fs.renameSync(tmpPath, videoPath); resolve(); }
      else { try { fs.unlinkSync(tmpPath); } catch {} reject(new Error(`ffmpeg trim exited ${code}`)); }
    });
    proc.on('error', reject);
  });
}

/**
 * Convert audio to standard format (24kHz, 16-bit, stereo WAV)
 */
export async function normalizeAudio(
  audioPath: string,
  outputPath?: string
): Promise<string> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const outPath = outputPath || path.join(
    path.dirname(audioPath),
    `${path.basename(audioPath, path.extname(audioPath))}_normalized.wav`
  );

  return new Promise((resolve, reject) => {
    const args = [
      '-i', audioPath,
      '-acodec', 'pcm_s16le',
      '-ar', '24000', // 24kHz sample rate
      '-ac', '2', // Stereo
      '-y',
      outPath,
    ];

    const ffmpeg = spawn(FFMPEG_BIN, args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Audio normalization failed: ${stderr}`));
        return;
      }

      if (!fs.existsSync(outPath)) {
        reject(new Error(`Normalized audio file not created: ${outPath}`));
        return;
      }

      resolve(outPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}

// ── Timeline / final-video concat helpers ────────────────────────────────

export type ClipEffect =
  | "none"
  | "fade-in"
  | "fade-out"
  | "fade-both"
  | "ken-burns"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "shake";
export type ClipTransition = "cut" | "fade" | "crossfade";

export interface CaptionStyle {
  fontSize?: number;    // default 28
  bottomPad?: number;   // pixels from the bottom (default 40)
  bgOpacity?: number;   // 0..1, default 0.55 (0 = no box)
  fontColor?: string;   // default "white"
}

export interface TimelineClip {
  videoPath: string;        // absolute local path to source video
  durationMs?: number;      // optional override; omit to use source duration
  effect?: ClipEffect;      // per-clip visual effect
  transition?: ClipTransition; // transition INTO this clip from the previous one
  transitionMs?: number;    // duration of that transition in ms (default 500)
  caption?: string;         // optional bottom caption overlaid on this clip
  captionStyle?: CaptionStyle;
}

// Pick the first font file that exists. Covers dev (macOS) + prod (Linux Forge).
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
];
function resolveFontFile(): string | null {
  for (const p of FONT_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch { /* noop */ }
  }
  return null;
}

/** Escape a string for use inside an ffmpeg filter-graph option value. */
function escapeFilterOption(value: string): string {
  // Backslash first, then the two characters that terminate option tokens.
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export interface RenderTimelineOptions {
  width?: number;           // default 1280
  height?: number;          // default 720
  fps?: number;             // default 24
  outputPath: string;       // absolute path where final mp4 is written
}

function ffprobeDurationSync(videoPath: string): Promise<number> {
  return getVideoDuration(videoPath);
}

function hasAudioStream(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_type",
      "-of", "default=nw=1:nk=1",
      videoPath,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("close", () => resolve(out.trim() === "audio"));
    proc.on("error", () => resolve(false));
  });
}

async function preprocessClip(
  clip: TimelineClip,
  idx: number,
  tmpDir: string,
  width: number,
  height: number,
  fps: number,
): Promise<{ path: string; durationMs: number }> {
  const srcDuration = await ffprobeDurationSync(clip.videoPath);
  const dMs = Math.min(clip.durationMs ?? srcDuration, srcDuration);
  const dSec = dMs / 1000;
  const outPath = path.join(tmpDir, `clip_${idx}.mp4`);

  // Build video filter chain
  const vf: string[] = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `setsar=1`,
    `fps=${fps}`,
  ];

  const effect = clip.effect ?? "none";
  const fadeSec = 0.4;
  if (effect === "fade-in" || effect === "fade-both") {
    vf.push(`fade=t=in:st=0:d=${fadeSec}`);
  }
  if (effect === "fade-out" || effect === "fade-both") {
    vf.push(`fade=t=out:st=${Math.max(0, dSec - fadeSec).toFixed(3)}:d=${fadeSec}`);
  }
  // Motion effects — all work by scaling the source larger than the canvas and
  // animating a crop window so we get real camera-like movement.
  // `dSec` is the clip duration; `t` in crop expressions is seconds-from-start.
  const motionEffects = new Set<ClipEffect>([
    "ken-burns", "zoom-in", "zoom-out",
    "pan-left", "pan-right", "pan-up", "pan-down",
    "shake",
  ]);
  if (motionEffects.has(effect as ClipEffect)) {
    const oversample = 1.2;                  // 20% bigger than canvas
    const panScale   = 1.18;                 // scale used for pan effects
    const zoomStart  = 1.0;
    const zoomEnd    = 1.15;

    // For zoom effects we use zoompan (simpler). For pans we use scale+crop
    // with an animated x/y. Shake uses scale+crop with sinusoidal jitter.
    if (effect === "ken-burns") {
      const frames = Math.max(1, Math.round(dSec * fps));
      vf.push(`zoompan=z='min(zoom+0.0010,1.10)':d=${frames}:s=${width}x${height}:fps=${fps}`);
    } else if (effect === "zoom-in") {
      const frames = Math.max(1, Math.round(dSec * fps));
      const rate = ((zoomEnd - zoomStart) / frames).toFixed(5);
      vf.push(`zoompan=z='min(zoom+${rate},${zoomEnd})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`);
    } else if (effect === "zoom-out") {
      const frames = Math.max(1, Math.round(dSec * fps));
      const rate = ((zoomEnd - zoomStart) / frames).toFixed(5);
      // Start at zoomEnd and ramp toward zoomStart. zoompan's `zoom` variable
      // can't go below 1, so we invert: `max(zoom-rate, 1)` and seed with `zoomEnd`.
      vf.push(`zoompan=z='if(eq(on,0),${zoomEnd},max(zoom-${rate},${zoomStart}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`);
    } else if (effect.startsWith("pan-")) {
      // Scale oversized, then crop the viewport along an axis.
      const sW = Math.round(width * panScale);
      const sH = Math.round(height * panScale);
      vf.push(`scale=${sW}:${sH}:force_original_aspect_ratio=decrease`);
      vf.push(`pad=${sW}:${sH}:(ow-iw)/2:(oh-ih)/2:color=black`);
      const dur = dSec.toFixed(3);
      let x: string, y: string;
      if (effect === "pan-left") {
        // start on the right edge, end on the left edge
        x = `(in_w-out_w)*(1 - t/${dur})`;
        y = `(in_h-out_h)/2`;
      } else if (effect === "pan-right") {
        x = `(in_w-out_w)*(t/${dur})`;
        y = `(in_h-out_h)/2`;
      } else if (effect === "pan-up") {
        x = `(in_w-out_w)/2`;
        y = `(in_h-out_h)*(1 - t/${dur})`;
      } else { // pan-down
        x = `(in_w-out_w)/2`;
        y = `(in_h-out_h)*(t/${dur})`;
      }
      vf.push(`crop=${width}:${height}:x='${x}':y='${y}'`);
    } else if (effect === "shake") {
      // Subtle handheld shake — oversample, then jitter the crop window.
      const sW = Math.round(width * oversample);
      const sH = Math.round(height * oversample);
      vf.push(`scale=${sW}:${sH}:force_original_aspect_ratio=decrease`);
      vf.push(`pad=${sW}:${sH}:(ow-iw)/2:(oh-ih)/2:color=black`);
      // Amplitudes in pixels; frequencies in rad/s. Two sines per axis for organic feel.
      vf.push(
        `crop=${width}:${height}` +
        `:x='(in_w-out_w)/2 + 6*sin(2*PI*1.7*t) + 3*sin(2*PI*3.3*t)'` +
        `:y='(in_h-out_h)/2 + 4*sin(2*PI*1.1*t+1) + 2*sin(2*PI*2.9*t)'`,
      );
    }
  }

  // Bottom-centered caption overlay. Uses a textfile so we don't have to reason
  // about quoting rules for the caption text itself.
  if (clip.caption && clip.caption.trim().length > 0) {
    const style = clip.captionStyle ?? {};
    const fontSize = Math.max(10, Math.round(style.fontSize ?? 28));
    const bottomPad = Math.max(0, Math.round(style.bottomPad ?? 40));
    const bgOpacity = Math.max(0, Math.min(1, style.bgOpacity ?? 0.55));
    const fontColor = style.fontColor ?? "white";
    const fontFile = resolveFontFile();

    const captionPath = path.join(tmpDir, `cap_${idx}.txt`);
    fs.writeFileSync(captionPath, clip.caption.replace(/\r\n?/g, "\n"));

    const parts: string[] = [
      `drawtext=textfile=${escapeFilterOption(captionPath)}`,
      `reload=0`,
      `fontsize=${fontSize}`,
      `fontcolor=${fontColor}`,
      `x=(w-text_w)/2`,
      `y=h-text_h-${bottomPad}`,
      `line_spacing=4`,
      `expansion=none`,
      `text_align=C`,
      `borderw=2`,
      `bordercolor=black@0.85`,
    ];
    if (bgOpacity > 0) {
      parts.push(`box=1`, `boxcolor=black@${bgOpacity.toFixed(2)}`, `boxborderw=12`);
    }
    if (fontFile) {
      parts.push(`fontfile=${escapeFilterOption(fontFile)}`);
    }
    vf.push(parts.join(":"));
  }

  // Some clips (raw RunPod videos) have no audio. The downstream filter_complex
  // requires [i:a] on every input, so synthesise silence when missing.
  const sourceHasAudio = await hasAudioStream(clip.videoPath);
  const args: string[] = [
    "-y",
    "-i", clip.videoPath,
  ];
  if (!sourceHasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  }
  // Force yuv420p — drawtext/zoompan can negotiate yuv444p, which encodes to
  // H.264 High 4:4:4 Predictive and is unplayable in QuickTime/Safari.
  vf.push("format=yuv420p");

  args.push(
    "-t", dSec.toFixed(3),
    "-vf", vf.join(","),
    "-map", "0:v:0",
    "-map", sourceHasAudio ? "0:a:0" : "1:a:0",
    "-c:v", "h264",
    "-preset", "medium",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-b:v", "5M",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg preprocess clip ${idx} exit ${code}: ${stderr.slice(-400)}`));
      resolve();
    });
    proc.on("error", reject);
  });

  const realDur = await ffprobeDurationSync(outPath).catch(() => dMs);
  return { path: outPath, durationMs: realDur };
}

/**
 * Render a still image (optionally with an audio track) as a short video clip.
 * If audioPath is null/undefined, silence is used. Duration is taken from the audio
 * when available unless durationMs is provided explicitly.
 */
export async function imageToVideo(
  imagePath: string,
  audioPath: string | null | undefined,
  outputPath: string,
  opts: { durationMs?: number; width?: number; height?: number; fps?: number } = {},
): Promise<string> {
  if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);
  if (audioPath && !fs.existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}`);

  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const fps = opts.fps ?? 24;

  let durationMs = opts.durationMs;
  if (durationMs == null && audioPath) {
    durationMs = await getAudioDuration(audioPath).catch(() => 3000);
  }
  if (durationMs == null) durationMs = 3000;
  const durationSec = Math.max(0.2, durationMs / 1000);

  const args: string[] = [
    "-y",
    "-loop", "1",
    "-framerate", String(fps),
    "-i", imagePath,
  ];

  if (audioPath) {
    args.push("-i", audioPath);
  } else {
    args.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`);
  }

  const vf = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `setsar=1`,
    `fps=${fps}`,
  ].join(",");

  args.push(
    "-t", durationSec.toFixed(3),
    "-vf", vf,
    "-c:v", "h264",
    "-preset", "medium",
    "-pix_fmt", "yuv420p",
    "-b:v", "5M",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`imageToVideo exit ${code}: ${stderr.slice(-500)}`)));
    proc.on("error", reject);
  });

  return outputPath;
}

/**
 * Render a timeline of clips into a single final video.
 * Applies per-clip effects (fade/ken-burns) and transitions between clips (cut/fade/crossfade).
 * Each input clip is first normalised to the target size/fps; then either concatenated
 * directly (for cuts) or combined via xfade (for fade/crossfade).
 */
export async function renderTimeline(
  clips: TimelineClip[],
  opts: RenderTimelineOptions,
): Promise<string> {
  if (clips.length === 0) throw new Error("renderTimeline: no clips supplied");
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const fps = opts.fps ?? 24;

  for (const c of clips) {
    if (!fs.existsSync(c.videoPath)) throw new Error(`Clip not found: ${c.videoPath}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(path.dirname(opts.outputPath), `.tl_`));
  try {
    const processed: { path: string; durationMs: number }[] = [];
    for (let i = 0; i < clips.length; i++) {
      const p = await preprocessClip(clips[i], i, tmpDir, width, height, fps);
      processed.push(p);
    }

    const needsXfade = clips.slice(1).some((c) => c.transition === "fade" || c.transition === "crossfade");

    if (!needsXfade) {
      // Simple concat demuxer
      const listPath = path.join(tmpDir, "list.txt");
      fs.writeFileSync(listPath, processed.map((p) => `file '${p.path.replace(/'/g, "'\\''")}'`).join("\n"));
      const args = [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-movflags", "+faststart",
        opts.outputPath,
      ];
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(FFMPEG_BIN, args);
        let stderr = "";
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`concat exit ${code}: ${stderr.slice(-400)}`)));
        proc.on("error", reject);
      });
    } else {
      // Build filter_complex with xfade between pairs
      const args: string[] = ["-y"];
      for (const p of processed) args.push("-i", p.path);

      let vChain = "[0:v]";
      let aChain = "[0:a]";
      let cumOffsetSec = processed[0].durationMs / 1000;
      const filters: string[] = [];

      for (let i = 1; i < processed.length; i++) {
        const inClip = clips[i];
        const transMs = Math.max(100, inClip.transitionMs ?? 500);
        const transSec = transMs / 1000;
        const xfType = inClip.transition === "crossfade" ? "dissolve" : inClip.transition === "fade" ? "fade" : "fade";
        const useXfade = inClip.transition === "fade" || inClip.transition === "crossfade";

        const vOut = `v${i}`;
        const aOut = `a${i}`;

        if (useXfade) {
          const offset = Math.max(0, cumOffsetSec - transSec);
          filters.push(
            `${vChain}[${i}:v]xfade=transition=${xfType}:duration=${transSec.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}]`,
          );
          filters.push(
            `${aChain}[${i}:a]acrossfade=d=${transSec.toFixed(3)}:c1=tri:c2=tri[${aOut}]`,
          );
          cumOffsetSec = offset + (processed[i].durationMs / 1000);
        } else {
          // straight cut inside a filter graph → concat of the two streams
          filters.push(
            `${vChain}[${i}:v]concat=n=2:v=1:a=0[${vOut}]`,
          );
          filters.push(
            `${aChain}[${i}:a]concat=n=2:v=0:a=1[${aOut}]`,
          );
          cumOffsetSec += processed[i].durationMs / 1000;
        }

        vChain = `[${vOut}]`;
        aChain = `[${aOut}]`;
      }

      args.push(
        "-filter_complex", filters.join(";"),
        "-map", vChain,
        "-map", aChain,
        "-c:v", "h264",
        "-preset", "medium",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high",
        "-b:v", "5M",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        opts.outputPath,
      );

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(FFMPEG_BIN, args);
        let stderr = "";
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`xfade render exit ${code}: ${stderr.slice(-600)}`)));
        proc.on("error", reject);
      });
    }

    return opts.outputPath;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

/**
 * Enhance an existing mp4 with an ffmpeg-only post-processing pass:
 * upscale + unsharp mask + light denoise. Used as a local fallback when a
 * ComfyUI upscale workflow isn't available on the target pod.
 */
export async function enhanceVideoFfmpeg(
  inputPath: string,
  outputPath: string,
  opts: { scale?: number; sharpen?: boolean; denoise?: boolean } = {},
): Promise<string> {
  if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
  const scale = opts.scale ?? 1.5;
  const filters: string[] = [];
  filters.push(`scale=iw*${scale}:ih*${scale}:flags=lanczos`);
  if (opts.denoise ?? true) filters.push("hqdn3d=1.5:1.5:6:6");
  if (opts.sharpen ?? true) filters.push("unsharp=5:5:0.8:5:5:0.0");

  const args = [
    "-y",
    "-i", inputPath,
    "-vf", filters.join(","),
    "-c:v", "h264",
    "-preset", "slow",
    "-crf", "18",
    "-c:a", "copy",
    "-movflags", "+faststart",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`enhance exit ${code}: ${stderr.slice(-500)}`)));
    proc.on("error", reject);
  });

  return outputPath;
}

/**
 * Generate silent audio of specified duration
 * Useful for padding or creating placeholder audio
 */
export async function generateSilence(
  durationMs: number,
  outputPath: string
): Promise<string> {
  const durationSec = (durationMs / 1000).toFixed(2);

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'lavfi',
      '-i', `anullsrc=r=24000:cl=stereo,atrim=0:${durationSec}`,
      '-y',
      outputPath,
    ];

    const ffmpeg = spawn(FFMPEG_BIN, args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Silence generation failed: ${stderr}`));
        return;
      }

      resolve(outputPath);
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}
