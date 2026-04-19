import { load } from "@/lib/db";
import { chat, resolveConfig, type Message } from "@/lib/llm-provider";

// Effects and transitions the LLM is allowed to pick from. Must match the enums
// used by the final-video route and the UI.
const EFFECTS = [
  "none", "fade-in", "fade-out", "fade-both",
  "ken-burns", "zoom-in", "zoom-out",
  "pan-left", "pan-right", "pan-up", "pan-down",
  "shake",
] as const;
const TRANSITIONS = ["cut", "fade", "crossfade"] as const;

// Shots per parallel LLM call — trades per-call latency against narrative coherence across adjacent shots.
const CHUNK_SIZE = 15;
const TOKENS_PER_SHOT = 140;

type PlanEntry = {
  shot_id: string;
  duration_ms: number;
  effect: typeof EFFECTS[number];
  transition: typeof TRANSITIONS[number];
  transition_ms: number;
  rationale?: string;
};

type ShotInfo = {
  shot_id: string;
  shot_number: number;
  character: string | null;
  story_line: string | null;
  dialogue: string | null;
  has_tts: boolean;
  has_video: boolean;
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: epId } = await params;
  const db = await load();

  const episode = db.episodes.find((e) => e.id === epId);
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  const shots: ShotInfo[] = db.shots
    .filter((s) => s.episode_id === epId)
    .filter((s) => !!(s.approved_image_id || s.approved_video_id || s.video_audio_path))
    .sort((a, b) => a.shot_number - b.shot_number)
    .map((s) => ({
      shot_id: s.id,
      shot_number: s.shot_number,
      character: s.character ?? null,
      story_line: s.story_line ?? null,
      dialogue: s.dialogue ?? null,
      has_tts: !!s.audio_path,
      has_video: !!s.approved_video_id,
    }));

  if (shots.length === 0) {
    return Response.json({ error: "No ready shots in this episode" }, { status: 400 });
  }

  const settings = db.prompt_settings.find((p) => p.project_id === episode.project_id) ?? null;
  const config = resolveConfig(settings, "content");

  const systemPrompt = `You are a film editor. You pick per-shot durations, camera motion effects, and transitions
to assemble an episode into an engaging short video. Respond with ONLY valid JSON — no prose, no markdown fences.

Rules for your choices:
- duration_ms: 2000-6000 for silent image shots; if has_tts is true, aim for 2500-5000 ms. If has_video is true use 2500-5000.
  For image shots carrying dialogue/story_line, err toward the longer end so viewers can read the caption.
- effect (pick ONE): ${EFFECTS.join(", ")}.
  Use shake ONLY for action / panic / combat beats.
  Use zoom-in for dramatic reveals or emotional close-ups.
  Use zoom-out for establishing shots or reveals of scale.
  Use pan-left/right/up/down to add motion to wide/landscape scenes.
  Use ken-burns for quiet, contemplative shots.
  Use fade-in on the first shot, fade-out on the last shot.
  Use none when the shot is already a video clip with its own motion (has_video=true).
- transition: how we enter this clip from the previous one. Use "cut" most of the time (>70%).
  Use "fade" for scene changes or time jumps. Use "crossfade" between two related shots of the same location/character.
- transition_ms: 300-1000. Use ~500 as default when transition is not "cut".
- First shot's transition is always "cut" regardless of other rules.
- rationale: ≤12 words, explaining why.`;

  // Split shots into contiguous chunks so we can fan out parallel LLM calls.
  const chunks: ShotInfo[][] = [];
  for (let i = 0; i < shots.length; i += CHUNK_SIZE) {
    chunks.push(shots.slice(i, i + CHUNK_SIZE));
  }

  const buildUserPrompt = (chunk: ShotInfo[], chunkIndex: number, totalChunks: number) => {
    const firstShotNumber = chunk[0]?.shot_number;
    const lastShotNumber = chunk[chunk.length - 1]?.shot_number;
    return `Episode ${episode.number}: ${episode.title}
Summary: ${episode.summary ?? "—"}

You are editing chunk ${chunkIndex + 1} of ${totalChunks} (shots ${firstShotNumber}–${lastShotNumber}).
${chunkIndex === 0 ? "This is the FIRST chunk — use fade-in on shot 1." : ""}
${chunkIndex === totalChunks - 1 ? "This is the LAST chunk — use fade-out on the final shot." : ""}

Shots (in playback order):
${chunk.map((s) => {
      const bits: string[] = [];
      bits.push(`shot ${s.shot_number} (shot_id: ${s.shot_id})`);
      if (s.character) bits.push(`character: ${s.character}`);
      bits.push(`has_video: ${s.has_video}`);
      bits.push(`has_tts: ${s.has_tts}`);
      return bits.join(" | ") + `\n  story_line: ${s.story_line ?? "—"}\n  dialogue: ${s.dialogue ?? "—"}`;
    }).join("\n")}

Respond with a JSON object of this exact shape:
{
  "plan": [
    {
      "shot_id": "<uuid from above>",
      "duration_ms": <int>,
      "effect": "<one of the allowed values>",
      "transition": "cut"|"fade"|"crossfade",
      "transition_ms": <int>,
      "rationale": "<short>"
    }
  ]
}

Include exactly one entry for every shot above, in the same order.`;
  };

  const planChunk = async (chunk: ShotInfo[], chunkIndex: number): Promise<PlanEntry[]> => {
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(chunk, chunkIndex, chunks.length) },
    ];
    const maxTokens = chunk.length * TOKENS_PER_SHOT + 200;
    const raw = await chat(messages, config, { maxTokens, contextSize: 8192 });
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let parsed: { plan?: PlanEntry[] } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Let the outer handler supply fallback entries for this whole chunk.
      return [];
    }
    const validShotIds = new Set(chunk.map((s) => s.shot_id));
    const out: PlanEntry[] = [];
    for (const e of parsed.plan ?? []) {
      if (!e || typeof e !== "object") continue;
      if (!validShotIds.has(e.shot_id)) continue;
      const effect = EFFECTS.includes(e.effect) ? e.effect : "none";
      const transition = TRANSITIONS.includes(e.transition) ? e.transition : "cut";
      const durationMs = Math.min(12000, Math.max(1000, Math.round(Number(e.duration_ms) || 3000)));
      const transitionMs = Math.min(3000, Math.max(100, Math.round(Number(e.transition_ms) || 500)));
      out.push({
        shot_id: e.shot_id,
        duration_ms: durationMs,
        effect,
        transition,
        transition_ms: transitionMs,
        rationale: typeof e.rationale === "string" ? e.rationale.slice(0, 200) : undefined,
      });
    }
    return out;
  };

  let chunkResults: PlanEntry[][];
  try {
    chunkResults = await Promise.all(chunks.map((c, i) => planChunk(c, i)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM call failed";
    return Response.json({ error: msg }, { status: 500 });
  }

  const plan: PlanEntry[] = chunkResults.flat();

  // Backfill any shots the LLM skipped (or any entire chunk that failed to parse).
  const coveredIds = new Set(plan.map((p) => p.shot_id));
  for (const s of shots) {
    if (!coveredIds.has(s.shot_id)) {
      plan.push({
        shot_id: s.shot_id,
        duration_ms: 3000,
        effect: "ken-burns",
        transition: "cut",
        transition_ms: 500,
        rationale: "fallback — LLM did not cover this shot",
      });
    }
  }

  // Re-order plan to match shot order so the UI can apply positionally if it wants.
  const idIndex = new Map(shots.map((s, i) => [s.shot_id, i]));
  plan.sort((a, b) => (idIndex.get(a.shot_id) ?? 0) - (idIndex.get(b.shot_id) ?? 0));

  if (plan[0]) plan[0].transition = "cut";

  return Response.json({
    ok: true,
    provider: config.provider,
    model: config.model,
    chunks: chunks.length,
    plan,
  });
}
