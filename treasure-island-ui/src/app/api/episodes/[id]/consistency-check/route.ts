import { load, Shot } from "@/lib/db";
import { chat, resolveConfig, Message } from "@/lib/llm-provider";

type Issue = { shots: number[]; type: string; severity: string; description: string; fix: string };
type ShotFacts = {
  shot_number: number; weather: string; time_of_day: string; lighting: string;
  location: string; indoor_outdoor: string; mood: string; character_description: string;
};

/**
 * Step 1: Ask LLM to extract structured facts from each shot prompt.
 * This is deterministic because we ask for specific fields.
 */
async function extractFacts(shots: Shot[], config: ReturnType<typeof resolveConfig>): Promise<ShotFacts[]> {
  const shotPrompts = shots.map((s) =>
    `Shot ${s.shot_number} [Character: ${s.character || "none"}]:\n"${s.full_prompt || s.shot_description}"\nEnvironment field: ${s.environment || "none"}\nLighting field: ${s.lighting || "none"}`
  ).join("\n\n");

  const messages: Message[] = [
    { role: "system", content: `You extract visual facts from image generation prompts.
For EACH shot, extract these exact fields from the prompt text. Use "none" if not mentioned.

Output a JSON array with one object per shot:
[
  {
    "shot_number": 1,
    "weather": "windy/rainy/calm/stormy/foggy/none",
    "time_of_day": "night/dawn/morning/noon/afternoon/sunset/dusk/none",
    "lighting": "describe the lighting: candlelight/moonlight/sunlight/dramatic/dim/bright/etc",
    "location": "specific place: inn interior/coastal road/ship deck/etc",
    "indoor_outdoor": "indoor/outdoor/both",
    "mood": "dark/bright/vibrant/gloomy/warm/cold/etc",
    "character_description": "physical appearance words used for the character in this shot, or none"
  }
]

Extract ONLY what the prompt actually says. Do not invent or assume.
Output ONLY the JSON array. No markdown.` },
    { role: "user", content: shotPrompts }
  ];

  const raw = await chat(messages, config);
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Step 2: Deterministic comparison — no LLM needed.
 * Compare adjacent shots and same-character shots.
 */
function compareShots(facts: ShotFacts[], shots: Shot[]): Issue[] {
  const issues: Issue[] = [];

  // ── Adjacent shot comparison ──
  for (let i = 0; i < facts.length - 1; i++) {
    const a = facts[i], b = facts[i + 1];

    // Weather mismatch between adjacent shots
    if (a.weather !== "none" && b.weather !== "none" && a.weather !== b.weather) {
      issues.push({ shots: [a.shot_number, b.shot_number], type: "weather",
        severity: "critical",
        description: `Shot ${a.shot_number} has "${a.weather}" weather but adjacent Shot ${b.shot_number} has "${b.weather}"`,
        fix: `Make weather consistent: change Shot ${a.shot_number} to "${b.weather}" or Shot ${b.shot_number} to "${a.weather}"` });
    }
    // One has weather, adjacent doesn't
    if ((a.weather !== "none" && b.weather === "none") || (a.weather === "none" && b.weather !== "none")) {
      const has = a.weather !== "none" ? a : b;
      const missing = a.weather !== "none" ? b : a;
      issues.push({ shots: [a.shot_number, b.shot_number], type: "weather",
        severity: "warning",
        description: `Shot ${has.shot_number} mentions "${has.weather}" weather but adjacent Shot ${missing.shot_number} has no weather specified`,
        fix: `Add "${has.weather}" to Shot ${missing.shot_number}'s prompt` });
    }

    // Time of day mismatch
    if (a.time_of_day !== "none" && b.time_of_day !== "none" && a.time_of_day !== b.time_of_day) {
      issues.push({ shots: [a.shot_number, b.shot_number], type: "time_of_day",
        severity: "critical",
        description: `Shot ${a.shot_number} is "${a.time_of_day}" but adjacent Shot ${b.shot_number} is "${b.time_of_day}"`,
        fix: `Align time of day across both shots` });
    }

    // Mood / art style drift
    if (a.mood !== "none" && b.mood !== "none" && a.mood !== b.mood) {
      issues.push({ shots: [a.shot_number, b.shot_number], type: "mood",
        severity: "warning",
        description: `Shot ${a.shot_number} has "${a.mood}" mood but adjacent Shot ${b.shot_number} has "${b.mood}"`,
        fix: `Align mood/tone across adjacent shots` });
    }

    // Lighting mismatch
    if (a.lighting !== "none" && b.lighting !== "none" && a.lighting.toLowerCase() !== b.lighting.toLowerCase()) {
      // Only flag if they're really different (not just minor wording)
      const aWords = new Set(a.lighting.toLowerCase().split(/[\s,]+/));
      const bWords = new Set(b.lighting.toLowerCase().split(/[\s,]+/));
      const overlap = [...aWords].filter(w => bWords.has(w)).length;
      if (overlap === 0) {
        issues.push({ shots: [a.shot_number, b.shot_number], type: "lighting",
          severity: "warning",
          description: `Shot ${a.shot_number} has "${a.lighting}" but adjacent Shot ${b.shot_number} has "${b.lighting}"`,
          fix: `Make lighting consistent between adjacent shots` });
      }
    }
  }

  // ── Same character across ALL shots ──
  const charMap = new Map<string, ShotFacts[]>();
  for (let i = 0; i < facts.length; i++) {
    const charName = shots[i].character?.toLowerCase();
    if (charName) {
      if (!charMap.has(charName)) charMap.set(charName, []);
      charMap.get(charName)!.push(facts[i]);
    }
  }
  for (const [charName, charFacts] of charMap) {
    if (charFacts.length < 2) continue;
    const descriptions = charFacts.filter(f => f.character_description !== "none");
    if (descriptions.length < 2) continue;
    // Compare each pair
    const first = descriptions[0];
    for (let j = 1; j < descriptions.length; j++) {
      const other = descriptions[j];
      if (first.character_description.toLowerCase() !== other.character_description.toLowerCase()) {
        issues.push({ shots: [first.shot_number, other.shot_number], type: "character",
          severity: "critical",
          description: `"${charName}" described differently: Shot ${first.shot_number} says "${first.character_description}" but Shot ${other.shot_number} says "${other.character_description}"`,
          fix: `Use identical character description for "${charName}" in all shots` });
      }
    }
  }

  return issues;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const episode = db.episodes.find((e) => e.id === id);
  if (!episode) return Response.json({ error: "Episode not found" }, { status: 404 });

  const shots = db.shots.filter((s) => s.episode_id === id).sort((a, b) => a.shot_number - b.shot_number);
  if (shots.length < 2) return Response.json({ issues: [], summary: "Need at least 2 shots to check consistency." });

  const settings = db.prompt_settings.find((s) => s.project_id === episode.project_id) ?? null;
  const config = resolveConfig(settings, "content");

  try {
    // Step 1: LLM extracts structured facts (deterministic extraction)
    const facts = await extractFacts(shots, config);

    // Step 2: Deterministic comparison (no LLM randomness)
    const issues = compareShots(facts, shots);

    // Build fact table for transparency
    const factTable = facts.map(f => ({
      shot: f.shot_number, weather: f.weather, time: f.time_of_day,
      lighting: f.lighting, location: f.location, indoor_outdoor: f.indoor_outdoor,
      mood: f.mood, character: f.character_description,
    }));

    const summary = issues.length === 0
      ? "All shots appear visually consistent. No weather, lighting, time-of-day, or character mismatches detected."
      : `Found ${issues.length} inconsistency issue(s) across ${shots.length} shots. ${issues.filter(i => i.severity === "critical").length} critical, ${issues.filter(i => i.severity === "warning").length} warnings.`;

    return Response.json({ summary, issues, facts: factTable });
  } catch (e) {
    return Response.json({ error: `Analysis error: ${String(e)}` }, { status: 500 });
  }
}
