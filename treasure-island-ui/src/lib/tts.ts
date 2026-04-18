import * as fs from "fs";
import * as path from "path";
import { resolveTtsHost } from "./pod-config";

export interface TTSResult {
  audio_path: string;
  duration_ms: number;
}

export interface TTSOptions {
  voice?: string;
  language?: string;
  speed?: number;
}

function getTTSHost(): string {
  return resolveTtsHost().replace(/\/$/, "");
}

/**
 * Generate speech via the remote XTTS Flask server (TTS_HOST).
 * The server saves the WAV to its local disk and returns the bytes.
 * We save it under public/generated/tts/ so the UI can play it.
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  const { voice = "default", language = "en", speed = 1.0 } = options;

  const host = getTTSHost();

  // Step 1: request generation
  const genRes = await fetch(`${host}/api/tts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, language, speed }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!genRes.ok) {
    const err = await genRes.text().catch(() => genRes.statusText);
    throw new Error(`TTS server error ${genRes.status}: ${err}`);
  }

  const genData = await genRes.json();
  if (!genData.success) throw new Error(genData.error ?? "TTS generation failed");

  const duration_ms: number = genData.duration_ms ?? 5000;
  // genData.audio_path may be:
  //   "/api/tts/audio/abc.wav"  (new server — API path)
  //   "/workspace/tts_output/abc.wav"  (old server — filesystem path)
  // Normalize to always use the /api/tts/audio/<filename> endpoint.
  const serverAudioPath: string = genData.audio_path ?? "";
  const audioFilename = serverAudioPath.startsWith("/api/tts/audio/")
    ? serverAudioPath.slice("/api/tts/audio/".length)
    : serverAudioPath.split("/").pop() ?? "";

  // Step 2: download the WAV and save locally so UI can play it
  const wavRes = await fetch(`${host}/api/tts/audio/${audioFilename}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!wavRes.ok) throw new Error(`Failed to download TTS audio: ${wavRes.status}`);

  const outDir = path.join(process.cwd(), "public", "generated", "tts");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const filename = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;
  const absPath = path.join(outDir, filename);
  const buf = Buffer.from(await wavRes.arrayBuffer());
  fs.writeFileSync(absPath, buf);

  const audio_path = `/generated/tts/${filename}`;
  return { audio_path, duration_ms };
}

/** Read WAV header to estimate playback duration */
function estimateWavDuration(buf: Buffer): number {
  try {
    if (buf.length < 44) return 5000;
    const dataSize = buf.readUInt32LE(40);
    const sampleRate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    const bitsPerSample = buf.readUInt16LE(34);
    const bytesPerSample = bitsPerSample / 8;
    const ms = Math.round((dataSize / (sampleRate * channels * bytesPerSample)) * 1000);
    return ms > 0 ? ms : 5000;
  } catch {
    return 5000;
  }
}

export function getAvailableVoices(): string[] {
  return ["default", "female_1", "female_2", "male_1", "male_2", "child"];
}
