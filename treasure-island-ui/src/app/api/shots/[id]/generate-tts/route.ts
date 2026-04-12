import { load, save, type Generation } from "@/lib/db";
import { generateSpeech, getAvailableVoices } from "@/lib/tts";
import { randomUUID } from "crypto";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shotId } = await params;
  const body = await req.json().catch(() => ({}));
  const { dialogue, voice = "default", language = "en", speed = 1.0 } = body;

  if (!dialogue?.trim()) return Response.json({ error: "dialogue is required" }, { status: 400 });
  if (dialogue.length > 500) return Response.json({ error: "Dialogue exceeds 500 characters" }, { status: 400 });

  const voices = getAvailableVoices();
  if (!voices.includes(voice)) return Response.json({ error: `Invalid voice. Available: ${voices.join(", ")}` }, { status: 400 });

  const db = await load();
  const shot = db.shots.find((s) => s.id === shotId);
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  let ttsResult;
  try {
    ttsResult = await generateSpeech(dialogue, { voice, language, speed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }

  const gen: Generation = {
    id: randomUUID(),
    shot_id: shotId,
    type: "tts",
    comfyui_prompt_id: null,
    status: "completed",
    seed: null,
    image_path: null,
    video_path: null,
    audio_path: ttsResult.audio_path,
    voice: voice,
    error: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };

  db.generations.push(gen);
  shot.audio_path = ttsResult.audio_path;
  shot.status = "tts_done";
  await save(db);

  return Response.json({ ok: true, audio_path: ttsResult.audio_path, duration_ms: ttsResult.duration_ms });
}
