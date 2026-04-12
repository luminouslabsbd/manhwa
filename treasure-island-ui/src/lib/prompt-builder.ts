import { PromptSettings, Character } from "@/lib/db";

const ART_STYLES: Record<string, string> = {
  manhwa: "Korean manhwa illustration style, webtoon art, clean linework, vibrant colors",
  anime: "anime illustration style, detailed shading, expressive eyes, Japanese animation quality",
  realistic: "photorealistic, hyper-detailed, 8k resolution, cinematic photography",
  webtoon: "webtoon digital art style, soft shading, clean lines, vertical scroll format",
  comic: "western comic book style, bold outlines, dynamic poses, halftone shading",
  watercolor: "watercolor painting style, soft edges, flowing colors, artistic brushstrokes",
  "dark fantasy": "dark fantasy illustration, gothic atmosphere, dramatic shadows, detailed armor and weapons",
  cyberpunk: "cyberpunk neon aesthetic, holographic effects, rain-slicked streets, tech noir",
};

const ENV_PRESETS: Record<string, string[]> = {
  urban: ["modern city street", "rooftop at dusk", "underground subway", "neon-lit alley", "busy intersection", "quiet park bench"],
  fantasy: ["enchanted forest", "crystal cave", "dragon's lair", "floating castle", "mystic lake", "ancient ruins"],
  medieval: ["stone castle courtyard", "village market", "dark dungeon", "throne room", "blacksmith workshop", "battlefield"],
  "sci-fi": ["space station interior", "alien planet surface", "cybernetic lab", "starship bridge", "holographic command center"],
  nature: ["mountain summit", "deep jungle", "ocean shore at sunset", "snowy wilderness", "desert oasis", "riverside meadow"],
  school: ["classroom", "school rooftop", "library", "gymnasium", "school gate at sunset", "hallway"],
  horror: ["abandoned hospital", "foggy cemetery", "dark basement", "haunted mansion hallway", "desolate forest at night"],
};

const LIGHTING_PRESETS: Record<string, string> = {
  cinematic: "cinematic lighting, volumetric rays, film grain",
  dramatic: "dramatic side lighting, deep shadows, high contrast",
  soft: "soft diffused lighting, gentle shadows, warm tones",
  neon: "neon glow, colored rim lighting, cyberpunk atmosphere",
  natural: "natural sunlight, realistic shadows, golden hour",
  moonlit: "moonlight illumination, blue tones, ethereal glow",
  studio: "studio lighting setup, three-point lighting, clean shadows",
};

const COLOR_PALETTES: Record<string, string> = {
  vibrant: "vibrant saturated colors, rich tones",
  "dark moody": "dark moody palette, desaturated, deep shadows",
  pastel: "pastel color palette, soft muted tones",
  monochrome: "monochromatic palette, black and white with accent color",
  warm: "warm color palette, amber and gold tones",
  cold: "cold color palette, blue and silver tones",
  neon: "neon color palette, electric blues and pinks",
};

/** Build a full image prompt from settings + shot data */
export function buildImagePrompt(
  settings: PromptSettings,
  opts: {
    character?: Character | null;
    shot_description: string;
    environment?: string;
    lighting?: string;
    camera_angle?: string;
  }
): string {
  const parts: string[] = [];

  // 1. Custom prefix
  if (settings.custom_prefix) parts.push(settings.custom_prefix);

  // 2. Quality tags
  if (settings.quality_tags) parts.push(settings.quality_tags);

  // 3. Art style
  const styleText = ART_STYLES[settings.art_style] || settings.art_style;
  parts.push(styleText);

  // 4. Character appearance (if any)
  if (opts.character) {
    parts.push(`${opts.character.name}, ${opts.character.appearance}, same character consistent face same design`);
  }

  // 5. Shot description (the core action/scene)
  parts.push(opts.shot_description);

  // 6. Environment
  if (settings.mode === "random") {
    const envList = ENV_PRESETS[settings.environment_preset] || ENV_PRESETS.urban;
    const randomEnv = envList[Math.floor(Math.random() * envList.length)];
    parts.push(randomEnv);
  } else if (opts.environment) {
    parts.push(opts.environment);
  }

  // 7. Camera angle
  if (opts.camera_angle) parts.push(opts.camera_angle);

  // 8. Lighting
  const lightingText = LIGHTING_PRESETS[opts.lighting || settings.lighting_preset] || opts.lighting || settings.lighting_preset;
  parts.push(lightingText);

  // 9. Color palette
  const colorText = COLOR_PALETTES[settings.color_palette] || settings.color_palette;
  parts.push(colorText);

  // 10. Custom suffix
  if (settings.custom_suffix) parts.push(settings.custom_suffix);

  return parts.filter(Boolean).join(", ");
}

/** Build a video prompt from settings + image prompt */
export function buildVideoPrompt(settings: PromptSettings, imagePrompt: string): string {
  const template = settings.video_prompt_template || "cinematic motion, smooth camera, {prompt}";
  return template.replace("{prompt}", imagePrompt);
}

/** Get available presets for the UI */
export function getPresets() {
  return {
    art_styles: Object.keys(ART_STYLES),
    environments: Object.keys(ENV_PRESETS),
    lighting: Object.keys(LIGHTING_PRESETS),
    color_palettes: Object.keys(COLOR_PALETTES),
    camera_angles: ["close-up", "medium shot", "wide shot", "extreme close-up", "over-the-shoulder", "bird's eye", "low angle", "high angle", "dutch angle", "tracking shot"],
  };
}
