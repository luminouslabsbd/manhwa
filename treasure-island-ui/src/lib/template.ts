// Shared template rendering utilities for prompt templates

export const STYLE_PACK = "manhwa style, detailed linework, semi-realistic characters, sharp facial features, dramatic lighting, high contrast shadows, cinematic composition, strong depth, clean outlines, limited color palette, dark tones, atmospheric perspective";

export const LIGHTING_MAP: Record<string, string> = {
  dark: "low key lighting, deep shadows, strong contrast, moody atmosphere",
  neutral: "balanced lighting, soft shadows, natural light, moderate contrast",
  intense: "extreme contrast lighting, strong highlights, deep blacks, cinematic dramatic light",
  dramatic: "extreme contrast lighting, strong highlights, deep blacks, cinematic dramatic light",
  warm: "warm golden lighting, soft ambient glow, cozy atmosphere",
  cold: "cool blue lighting, cold desaturated tones, harsh shadows",
};

export const ENV_MAP: Record<string, string> = {
  inn: "dark wooden seaside inn, old wood textures, dim candlelight, worn furniture, 18th century atmosphere",
  road: "dark coastal road, night atmosphere, wind, rough terrain",
  ship: "18th century sailing ship deck, ropes and rigging, ocean waves, wooden planks",
  outdoor: "rugged outdoor terrain, natural landscape",
  sea: "open ocean, waves crashing, sea spray, horizon line",
  cave: "dark cave interior, rocky walls, echoing space, minimal light",
  forest: "dense forest, twisted trees, dappled light through leaves",
  island: "tropical island, dense jungle, sandy beach, mysterious atmosphere",
};

export interface TemplateVarDef {
  key: string;
  label: string;
  hint: string;
  color: string;
}

export const INTERACTION_TYPES = [
  { value: "solo",          label: "Solo",             hint: "Single character focus" },
  { value: "dialogue",      label: "Dialogue",         hint: "Face-to-face conversation" },
  { value: "passing-object",label: "Passing Object",   hint: "Handing something between characters" },
  { value: "action",        label: "Action / Fight",   hint: "Physical movement or combat" },
  { value: "side-by-side",  label: "Side by Side",     hint: "Standing or sitting together" },
  { value: "confrontation", label: "Confrontation",    hint: "Tense standoff" },
  { value: "crowd",         label: "Crowd / Group",    hint: "Three or more characters" },
];

export const INTERACTION_SPATIAL: Record<string, { left: string; right: string; hint: string }> = {
  dialogue:        { left: "left side, facing right",   right: "right side, facing left",   hint: "face-to-face exchange" },
  "passing-object":{ left: "left, extending arm forward, open hand", right: "right, reaching out to receive", hint: "hand interaction prominent" },
  action:          { left: "attacking/moving left",      right: "reacting/moving right",      hint: "dynamic pose, motion blur" },
  "side-by-side":  { left: "left side",                  right: "right side",                 hint: "equal composition" },
  confrontation:   { left: "left, tense posture",        right: "right, tense posture",       hint: "dramatic standoff" },
  crowd:           { left: "foreground left",             right: "background or right",        hint: "depth layering" },
  solo:            { left: "center frame",                right: "",                           hint: "single subject" },
};

export const TEMPLATE_VARS: TemplateVarDef[] = [
  { key: "char",       label: "All Chars",    hint: "All characters — name + appearance combined",       color: "#60a5fa" },
  { key: "char_name",  label: "Char Names",   hint: "All character names only",                          color: "#93c5fd" },
  { key: "char1",      label: "Character 1",  hint: "First selected character — name + appearance",      color: "#34d399" },
  { key: "char2",      label: "Character 2",  hint: "Second selected character — name + appearance",     color: "#f472b6" },
  { key: "char1_name", label: "Char 1 Name",  hint: "First character name only",                         color: "#6ee7b7" },
  { key: "char2_name", label: "Char 2 Name",  hint: "Second character name only",                        color: "#fbcfe8" },
  { key: "shot",       label: "Shot Desc",    hint: "Shot description / action",                         color: "#4ade80" },
  { key: "camera",     label: "Camera",       hint: "Camera angle",                                      color: "#f59e0b" },
  { key: "env",        label: "Environment",  hint: "Resolved environment description",                  color: "#2dd4bf" },
  { key: "location",   label: "Location",     hint: "Location brick description (specific set / room)",  color: "#facc15" },
  { key: "lighting",   label: "Lighting",     hint: "Resolved lighting description",                     color: "#fb923c" },
  { key: "style",      label: "Style Pack",   hint: "Full manhwa/anime style pack",                      color: "#a78bfa" },
  { key: "interaction",label: "Interaction",  hint: "Interaction type description for spatial positioning", color: "#e879f9" },
];

export const VAR_COLOR: Record<string, string> = Object.fromEntries(TEMPLATE_VARS.map(v => [v.key, v.color]));

export const DEFAULT_FORMULA = "[char], [shot], [camera], [env], [location], [style], [lighting]";

export interface ShotLike {
  character?: string | null;
  location_id?: string | null;
  shot_description: string;
  camera_angle: string;
  environment: string;
  lighting: string;
  interaction_type?: string | null;
  // Optional pre-resolved per-character blocks (set by API when char data available)
  _char1_block?: string;
  _char2_block?: string;
  _char1_name?: string;
  _char2_name?: string;
}

export function resolveVar(
  varKey: string,
  shot: ShotLike,
  charAppearance?: string | null,
  locationDesc?: string | null,
): string {
  switch (varKey) {
    case "char": {
      const raw = shot.character ?? "";
      if (!raw) return "";
      if (charAppearance) return charAppearance;
      return raw;
    }
    case "char_name": return shot.character ?? "";
    case "char1":      return shot._char1_block ?? (shot.character?.split(",")[0]?.trim() ?? "");
    case "char2":      return shot._char2_block ?? (shot.character?.split(",")[1]?.trim() ?? "");
    case "char1_name": return shot._char1_name  ?? (shot.character?.split(",")[0]?.trim() ?? "");
    case "char2_name": return shot._char2_name  ?? (shot.character?.split(",")[1]?.trim() ?? "");
    case "shot": return shot.shot_description;
    case "camera": return shot.camera_angle;
    case "env": return ENV_MAP[shot.environment?.toLowerCase() ?? ""] ?? shot.environment ?? "";
    case "location": return locationDesc ?? "";
    case "lighting": return LIGHTING_MAP[shot.lighting?.toLowerCase() ?? ""] ?? shot.lighting ?? "";
    case "style": return STYLE_PACK;
    case "interaction": {
      const spatial = INTERACTION_SPATIAL[shot.interaction_type ?? ""] ?? null;
      return spatial ? spatial.hint : (shot.interaction_type ?? "");
    }
    default: return `[${varKey}]`;
  }
}

export function renderTemplate(
  formula: string,
  shot: ShotLike,
  charAppearance?: string | null,
  locationDesc?: string | null,
): string {
  const result = formula.replace(/\[([a-z_]+)\]/g, (_, key) => resolveVar(key, shot, charAppearance, locationDesc));
  return result.replace(/,\s*,/g, ",").replace(/,\s*$/g, "").trim();
}

/** Resolved values for all known variables for a given shot */
export function resolveAllVars(
  shot: ShotLike,
  charAppearance?: string | null,
  locationDesc?: string | null,
): Record<string, string> {
  return Object.fromEntries(TEMPLATE_VARS.map(v => [v.key, resolveVar(v.key, shot, charAppearance, locationDesc)]));
}

// Parse formula into segments: plain text or var tokens
export type FormulaSegment = { type: "text"; text: string } | { type: "var"; key: string };

export function parseFormula(formula: string): FormulaSegment[] {
  const segments: FormulaSegment[] = [];
  let remaining = formula;
  const varRe = /\[([a-z_]+)\]/;
  while (remaining.length > 0) {
    const match = varRe.exec(remaining);
    if (!match) {
      segments.push({ type: "text", text: remaining });
      break;
    }
    if (match.index > 0) segments.push({ type: "text", text: remaining.slice(0, match.index) });
    segments.push({ type: "var", key: match[1] });
    remaining = remaining.slice(match.index + match[0].length);
  }
  return segments;
}
