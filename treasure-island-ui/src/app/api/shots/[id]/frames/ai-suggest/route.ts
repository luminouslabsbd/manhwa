import { prisma } from "@/lib/prisma";
import { chat, resolveConfig } from "@/lib/llm-provider";
import { prisma as db } from "@/lib/prisma";

// ── Detect if a frame is environment/atmosphere/silhouette focused ──
const ENV_KEYWORDS = /silhouette|establishing|wide\s+shot|panoram|landscape|background|environment|storm|fog|mist|rain|dawn|dusk|sunset|sunrise|skyline|aerial|bird.?s.?eye|exterior|interior\s+shot|empty\s+room|scene\s+set/i;
const CHAR_CLOSE_KEYWORDS = /close.?up|face|expression|eye|emotion|reaction|extreme\s+close|portrait/i;

function isEnvironmentFrame(frameDescription: string): boolean {
  return ENV_KEYWORDS.test(frameDescription) && !CHAR_CLOSE_KEYWORDS.test(frameDescription);
}

// Extract only style/quality tokens from a full prompt (strip character appearance)
function extractStyleTokens(fullPrompt: string): string {
  const styleMarkers = ["manhwa style", "detailed linework", "semi-realistic", "sharp facial", "illustration", "cinematic", "dramatic lighting", "high contrast", "limited color palette", "dark tones", "atmospheric"];
  for (const marker of styleMarkers) {
    const idx = fullPrompt.toLowerCase().indexOf(marker.toLowerCase());
    if (idx > 0) return fullPrompt.slice(idx).trim();
  }
  return "";
}

// ── Build a frame prompt that embeds character appearance + style tokens ──
function buildFramePrompt(
  fullPrompt: string,
  shotDescription: string,
  frameDescription: string,
  charAppearance: string | null,
  charName?: string | null,
): string {
  // Environment/silhouette frames: lead with scene, keep character as a minimal token
  if (isEnvironmentFrame(frameDescription)) {
    const styleTokens = extractStyleTokens(fullPrompt);
    // Extract environment context from the original prompt (everything between char tokens and style tokens)
    const charTokenEnd = charAppearance
      ? (() => {
          const firstCharToken = charAppearance.split(",")[0].trim().toLowerCase();
          const idx = fullPrompt.toLowerCase().indexOf(firstCharToken);
          return idx > 0 ? idx : 0;
        })()
      : 0;
    const styleStart = styleTokens ? fullPrompt.toLowerCase().indexOf(styleTokens.split(",")[0].toLowerCase()) : fullPrompt.length;
    const envContext = fullPrompt.slice(charTokenEnd, styleStart).replace(/^[,\s]+|[,\s]+$/g, "");

    // Character becomes a silhouette token only (no detailed appearance)
    const charToken = charName ? `${charName} as dark silhouette` : "dark silhouette figure";

    const parts = [frameDescription, charToken, envContext, styleTokens].filter(Boolean);
    return parts.join(", ");
  }

  // Character-focused frames: inject frame description into the full prompt
  const escaped = shotDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let base = fullPrompt.replace(new RegExp(escaped, "i"), frameDescription);
  if (base === fullPrompt) {
    const styleKeywords = ["manhwa style", "detailed linework", "semi-realistic", "sharp facial", "illustration"];
    let inserted = false;
    for (const kw of styleKeywords) {
      const kwIdx = base.toLowerCase().indexOf(kw.toLowerCase());
      if (kwIdx > 0) {
        base = `${base.slice(0, kwIdx)}${frameDescription}, ${base.slice(kwIdx)}`;
        inserted = true;
        break;
      }
    }
    if (!inserted) base = `${frameDescription}, ${base}`;
  }

  // Inject compact character appearance only for character-focused frames
  if (charAppearance) {
    const alreadyHas = charAppearance.split(",").slice(0, 2).some(tok =>
      base.toLowerCase().includes(tok.trim().toLowerCase())
    );
    if (!alreadyHas) {
      const compact = charAppearance.split(",").slice(0, 3).join(",").trim();
      base = `${base}, ${compact}`;
    }
  }

  return base;
}

// ── Local motion heuristic – fallback when LLM fails or returns garbage ──
const MOTION_PATTERNS = [
  /walk|run|flee|ride|move|swing|turn|open|clos|fall|ris|step|approach|enter|exit/i,
  /blink|shift|tighten|widen|narrow|raise|lower|nod|shak|twist|reach/i,
  /slow(ly)?|gradual|sequence|then|before|after|while/i,
  /vibrat|trembl|flutter|sway|wave|drift|float|push|pull/i,
  /lightning\s+reveal|flash|pan|zoom/i,
  /;\s*(then|before|slight|slow|tension|builds)/i,
];

function localHeuristic(
  prompt: string,
  description: string,
  charAppearance: string | null,
  charName?: string | null,
): Array<{ frame_number: number; description: string; needed: boolean; prompt: string }> {
  const text = `${prompt} ${description}`;
  const motionHits = MOTION_PATTERNS.filter(p => p.test(text)).length;
  if (motionHits === 0) return [];

  const segments = description
    .split(/[;,]/)
    .map(s => s.trim())
    .filter(s => s.length > 8)
    .slice(0, 3);

  if (segments.length <= 1) {
    const startDesc = `Start: ${description.slice(0, 70)}`;
    const endDesc = `End state: ${description.slice(0, 70)}`;
    return [
      { frame_number: 1, description: startDesc, needed: true, prompt: buildFramePrompt(prompt, description, startDesc, charAppearance, charName) },
      { frame_number: 2, description: endDesc, needed: true, prompt: buildFramePrompt(prompt, description, endDesc, charAppearance, charName) },
    ];
  }

  return segments.map((seg, i) => ({
    frame_number: i + 1,
    description: seg,
    needed: true,
    prompt: buildFramePrompt(prompt, description, seg, charAppearance, charName),
  }));
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });

  // Load character details for this shot
  let charAppearance: string | null = null;
  let charName: string | null = shot.character ?? null;
  let charRefImage: string | null = null;
  if (shot.character) {
    const char = await prisma.character.findFirst({
      where: { project_id: shot.project_id, name: { equals: shot.character, mode: "insensitive" } },
    });
    if (char) {
      charAppearance = char.appearance ?? null;
      charRefImage = char.reference_image ?? null;
      charName = char.name;
    }
  }

  const ps = await db.promptSettings.findUnique({ where: { project_id: shot.project_id } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = resolveConfig(ps as any, "content");

  const charContext = charName
    ? `Character: ${charName}${charAppearance ? `\nAppearance: ${charAppearance}` : ""}${charRefImage ? `\nReference image: available (use consistent appearance)` : ""}`
    : "No named character (scene shot).";

  const userMsg =
    `You are breaking a manga/manhwa animation shot into keyframes.

Shot description: "${shot.shot_description}"
${shot.anchor ? `Action/anchor: "${shot.anchor}"` : ""}
${shot.dialogue ? `Dialogue: "${shot.dialogue}"` : ""}
${charContext}
Full image prompt: "${shot.full_prompt}"

Task: Does this shot show motion, a sequence of actions, or a meaningful change in pose/expression/position?
- If NO (a single static image is sufficient) → reply: []
- If YES → list 2–4 keyframe moments. Each description must:
  * Be a specific, visual action at that moment (not generic)
  * For ENVIRONMENT or SILHOUETTE frames (wide shots, establishing shots, storm/fog/atmosphere scenes, character as distant figure): start the description with "Silhouette:" or "Establishing:" — describe the SCENE first, character is a small/distant figure, no face details
  * For CHARACTER-CLOSE frames (close-ups, expressions, reactions): describe character appearance and emotion
  * Focus on WHAT IS DIFFERENT from the previous frame

Reply ONLY with a JSON array, no other text:
[{"frame_number":1,"description":"specific visual moment","needed":true},...]`;

  try {
    const text = await chat([{ role: "user", content: userMsg }], config);

    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) throw new Error("no JSON");

    const raw: { frame_number: number; description: string; needed: boolean }[] = JSON.parse(jsonMatch[0]);

    if (raw.length === 0) {
      return Response.json({ ok: true, suggestions: [], sufficient: true });
    }

    if (raw.length === 1) {
      const s = raw[0];
      const suggestions = [
        { frame_number: 1, description: `Start: ${s.description}`, needed: true, prompt: buildFramePrompt(shot.full_prompt, shot.shot_description, `Start: ${s.description}`, charAppearance, charName) },
        { frame_number: 2, description: `End: ${s.description}`, needed: true, prompt: buildFramePrompt(shot.full_prompt, shot.shot_description, `End: ${s.description}`, charAppearance, charName) },
      ];
      return Response.json({ ok: true, suggestions });
    }

    const suggestions = raw.map(s => ({
      ...s,
      prompt: buildFramePrompt(shot.full_prompt, shot.shot_description, s.description, charAppearance, charName),
    }));

    return Response.json({ ok: true, suggestions, charRefImage });
  } catch {
    const fallback = localHeuristic(shot.full_prompt, shot.shot_description, charAppearance, charName);
    if (fallback.length === 0) {
      return Response.json({ ok: true, suggestions: [], sufficient: true });
    }
    return Response.json({ ok: true, suggestions: fallback, fallback: true });
  }
}
