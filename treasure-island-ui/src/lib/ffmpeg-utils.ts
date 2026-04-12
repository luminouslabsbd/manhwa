import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

    const ffmpeg = spawn('ffmpeg', args);
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

    const ffmpeg = spawn('ffmpeg', args);
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
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1:noescapes=1',
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

    const ffmpeg = spawn('ffmpeg', args);
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

    const ffmpeg = spawn('ffmpeg', args);
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
