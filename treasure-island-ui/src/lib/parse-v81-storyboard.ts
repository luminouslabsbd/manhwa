/**
 * Direct parser for V8.1 storyboard format.
 * Extracts Line/Anchor/Shot fields without LLM — 100% accurate for this format.
 */

export interface CharacterInfo {
  name: string;
  description: string;
  appearance: string;
  role: string;
  reference_prompt: string;
}

export const KNOWN_CHARACTERS: Record<string, CharacterInfo> = {
  Jim: {
    name: "Jim",
    description: "A young teenage boy who works at his family's seaside inn. Cautious, observant, and pulled into danger by circumstance. The protagonist whose choices drive the story.",
    appearance: "young teenage boy, slim build, short dark hair, expressive wide eyes, slightly worried expression, simple 18th century clothes, muted neutral colors, no facial hair, approx 14-15 years old",
    role: "protagonist",
    reference_prompt: "Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed manhwa style illustration. Jim: young teenage boy, slim build, short dark hair, expressive wide eyes, slightly worried expression, simple 18th century clothes, muted neutral colors, no facial hair. Consistent character design, neutral pose, clear visible features, full body from head to toe",
  },
  "Old Sailor": {
    name: "Old Sailor",
    description: "Also known as Billy Bones. A hardened pirate who arrives at the inn carrying a deadly secret — a treasure map. Aggressive, paranoid, and hiding from enemies.",
    appearance: "middle-aged rugged man, weathered face with deep lines, visible scar across cheek, unshaven thick beard, long messy greying hair, worn pirate-style clothes, heavy stocky build, intense threatening gaze, 18th century sailor attire",
    role: "supporting",
    reference_prompt: "Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed manhwa style illustration. Old Sailor Billy Bones: middle-aged rugged man, weathered face, visible scar across cheek, unshaven beard, long messy hair, pirate-style worn clothes, heavy build, intense gaze. Consistent character design, neutral pose, clear visible features, full body from head to toe",
  },
  "Blind Man": {
    name: "Blind Man",
    description: "A terrifying enforcer working for the pirates. Despite being blind, he moves with unsettling precision and delivers death warrants. Deeply sinister.",
    appearance: "elderly thin man, pale gaunt skin, milky blind eyes with dark empty gaze, sharp angular facial features, old threadbare worn clothes, carries a cane, unsettling eerie presence, slow deliberate movement",
    role: "antagonist",
    reference_prompt: "Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed manhwa style illustration. Blind Man: elderly thin man, pale skin, milky blind eyes, sharp facial features, old worn clothes, carries a cane. Consistent character design, neutral pose, clear visible features, full body from head to toe",
  },
  "Mysterious Man": {
    name: "Mysterious Man",
    description: "A calculated and dangerous figure pursuing the treasure map. Cold, composed, and never shows his true intentions. Primary antagonist in the later episodes.",
    appearance: "adult man mid-30s, calm composed expression, sharp intelligent eyes, controlled upright posture, neutral but threatening demeanor, clean simple dark clothes, no visible weapon, composed dangerous presence",
    role: "antagonist",
    reference_prompt: "Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed manhwa style illustration. Mysterious Man: adult man, calm expression, sharp eyes, controlled posture, neutral but threatening demeanor, clean but simple clothes. Consistent character design, neutral pose, clear visible features, full body from head to toe",
  },
};

const CHARACTER_DESCRIPTORS: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_CHARACTERS).map(([k, v]) => [k, v.appearance])
);

const STYLE_PACK =
  "manhwa style, detailed linework, semi-realistic characters, sharp facial features, dramatic lighting, high contrast shadows, cinematic composition, strong depth, clean outlines, limited color palette, dark tones, atmospheric perspective";
const ENV_INN = "dark wooden seaside inn, old wood textures, dim lighting, candles as main light source, worn furniture, 18th century atmosphere";
const ENV_ROAD = "dark coastal road, night atmosphere, wind, minimal visibility, rough terrain, isolated environment";

function detectCharacter(line: string, anchor: string, shot: string, epNum: number): string | null {
  const t = `${line} ${anchor} ${shot}`.toLowerCase();
  if (t.includes("jim")) return "Jim";
  if (t.includes("blind man")) return "Blind Man";
  if (t.includes("sailor") || t.includes("billy bones")) return "Old Sailor";
  // Episodes 8–10: "the man" = Mysterious Man
  if (epNum >= 8 && /\bthe man\b|\bman stepped\b|\bman smiled\b|\bman reached\b|\bman turned\b|\bman didn/.test(t)) return "Mysterious Man";
  return null;
}

function detectEnvironment(text: string, epNum: number): string {
  const t = text.toLowerCase();
  if (t.includes("road") || t.includes("outside") || t.includes("running") || t.includes("chase") || t.includes("path") || epNum >= 6) return "road";
  return "inn";
}

function detectLighting(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("lightning") || t.includes("flash") || t.includes("extreme")) return "intense";
  return "dark"; // default for tension/shadow-heavy storyboard
}

function detectCameraAngle(shot: string): string {
  const t = shot.toLowerCase();
  if (t.includes("extreme close")) return "extreme close-up";
  if (t.includes("close-up") || t.includes("close up")) return "close-up";
  if (t.includes("wide shot")) return "wide shot";
  if (t.includes("medium shot")) return "medium shot";
  return "close-up"; // V8.1 defaults
}

function buildFullPrompt(character: string | null, shotDesc: string, anchor: string, environment: string, lighting: string): string {
  const parts: string[] = [];
  if (character && CHARACTER_DESCRIPTORS[character]) parts.push(CHARACTER_DESCRIPTORS[character]);
  parts.push(`${anchor}: ${shotDesc}`);
  parts.push(environment === "road" ? ENV_ROAD : ENV_INN);
  parts.push(STYLE_PACK);
  if (lighting === "intense") parts.push("extreme contrast lighting, strong highlights, deep blacks, cinematic dramatic light");
  else parts.push("low key lighting, deep shadows, strong contrast, moody atmosphere");
  return parts.join(", ");
}

export interface V81Shot {
  shot_number: number;
  story_line: string;
  anchor: string;
  shot_description: string;
  character: string | null;
  environment: string;
  lighting: string;
  camera_angle: string;
  full_prompt: string;
  dialogue?: string | null;
}

export interface V81Episode {
  number: number;
  title: string;
  summary: string;
  shots: V81Shot[];
}

/** Returns true if this text looks like a V8.1 storyboard */
export function isV81Format(text: string): boolean {
  return /Line:\s*.+\nAnchor:\s*.+\nShot:\s*.+/m.test(text);
}

export function parseV81Storyboard(text: string): V81Episode[] {
  const episodes: V81Episode[] = [];

  const epRegex = /EPISODE\s+(\d+)\s*[—–\-]\s*([^\n]+)/gi;
  const epMatches: { num: number; title: string; pos: number }[] = [];
  let m;
  while ((m = epRegex.exec(text)) !== null) {
    epMatches.push({ num: parseInt(m[1]), title: m[2].trim(), pos: m.index });
  }
  if (!epMatches.length) return [];

  for (let i = 0; i < epMatches.length; i++) {
    const start = epMatches[i].pos;
    const end = i + 1 < epMatches.length ? epMatches[i + 1].pos : text.length;
    const epText = text.slice(start, end);
    const epNum = epMatches[i].num;
    const epTitle = epMatches[i].title.replace(/\s+/g, " ").trim();

    const shots = parseEpisodeShots(epText, epNum);
    if (shots.length > 0) {
      episodes.push({ number: epNum, title: epTitle, summary: `Episode ${epNum}: ${epTitle}`, shots });
    }
  }

  return episodes;
}

function parseEpisodeShots(epText: string, epNum: number): V81Shot[] {
  const shots: V81Shot[] = [];

  // Strategy: find all Line:/Anchor:/Shot: triplets, then back-fill shot numbers.
  // This is more reliable than anchoring to the shot number line (which PDF
  // extraction sometimes merges or separates differently).
  const tripletRegex = /Line:\s*(.+?)\r?\nAnchor:\s*(.+?)\r?\nShot:\s*(.+?)(?=\r?\n|$)/gm;

  // Also collect shot numbers that appear on their own line (1-2 digits only)
  const shotNumberPositions: { num: number; pos: number }[] = [];
  const numRegex = /(?:^|\n)(\d{1,2})\s*(?:\r?\n)/g;
  let nm;
  while ((nm = numRegex.exec(epText)) !== null) {
    const n = parseInt(nm[1]);
    if (n >= 1 && n <= 30) shotNumberPositions.push({ num: n, pos: nm.index });
  }

  let m;
  let shotIndex = 0;
  while ((m = tripletRegex.exec(epText)) !== null) {
    const line = m[1].trim();
    const anchor = m[2].trim();
    const shotDesc = m[3].trim();

    // Find the nearest shot number that precedes this triplet
    let shotNum = ++shotIndex;
    for (let i = shotNumberPositions.length - 1; i >= 0; i--) {
      if (shotNumberPositions[i].pos <= m.index) {
        shotNum = shotNumberPositions[i].num;
        break;
      }
    }

    const character = detectCharacter(line, anchor, shotDesc, epNum);
    const environment = detectEnvironment(`${line} ${shotDesc}`, epNum);
    const lighting = detectLighting(`${line} ${anchor} ${shotDesc}`);
    const camera_angle = detectCameraAngle(shotDesc);
    const full_prompt = buildFullPrompt(character, shotDesc, anchor, environment, lighting);

    shots.push({ shot_number: shotNum, story_line: line, anchor, shot_description: `${anchor}: ${shotDesc}`, character, environment, lighting, camera_angle, full_prompt });
  }

  return shots;
}
