import { chat, resolveConfig, type Message, type TaskType } from "@/lib/llm-provider";
import { type PromptSettings } from "@/lib/db";

export type ParsedShot = {
  shot_number: number;
  character: string | null;
  shot_description: string;
  environment: string;
  lighting: string;
  camera_angle: string;
  full_prompt: string;
  story_line?: string | null;
  anchor?: string | null;
  dialogue?: string | null;
};

export type ParsedEpisode = {
  number: number;
  title: string;
  summary: string;
  shots: ParsedShot[];
};

export type ParsedProject = {
  episodes: ParsedEpisode[];
};

export type ParsedCharacter = {
  name: string;
  description: string;
  appearance: string;
  role: string;
};

export type GeneratedStory = {
  characters: ParsedCharacter[];
  episodes: ParsedEpisode[];
};

/** Helper: call LLM and parse JSON from response */
async function llmJSON<T>(messages: Message[], settings?: PromptSettings | null, task: TaskType = "content"): Promise<T> {
  const config = resolveConfig(settings, task);
  const text = await chat(messages, config);
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`LLM returned invalid JSON (${config.provider}/${config.model}): ${jsonStr.slice(0, 200)}`);
  }
}

/** Helper: call LLM and return plain text */
export async function llmText(prompt: string, settings?: PromptSettings | null, task: TaskType = "content"): Promise<string> {
  const config = resolveConfig(settings, task);
  return chat([{ role: "user", content: prompt }], config);
}

export async function parseStoryboardWithLLM(
  storyboardText: string,
  styleGuideText: string,
  projectName: string,
  settings?: PromptSettings | null,
): Promise<ParsedProject> {
  const systemPrompt = `You are an expert manhwa/webtoon production AI using the V8.1 shot system.

Each shot follows: Line → Anchor → Shot
- Line: narration (voice-over + subtitles)
- Anchor: the ONE key visual element (must be visible in <1 second)
- Shot: how the anchor is shown with ONE micro-action

SHOT PATTERNS (select the most concrete one):
ACTION: HAND-GRAB, FOOTSTEP-IMPACT, BODY-COLLAPSE, PATH-FORWARD
REACTION: EYES-REACTION, HEAD-TURN, HAND-TIGHTEN
REVEAL: OBJECT-REVEAL, SILHOUETTE-REVEAL, SHADOW-ENTRY
TENSION: STILLNESS-FREEZE, SHADOW-ENGULF, DISTANCE-CLOSING
TRANSITION: THRESHOLD-CROSSING, DOOR-SLOW-OPEN

PROMPT STRUCTURE (mandatory for full_prompt):
[SHOT PATTERN PROMPT], [ENVIRONMENT], [STYLE PACK], [LIGHTING VARIANT]

STYLE PACK (append to ALL prompts):
manhwa style, detailed linework, semi-realistic characters, sharp facial features, dramatic lighting, high contrast shadows, cinematic composition, strong depth, clean outlines, limited color palette, dark tones, atmospheric perspective

LIGHTING VARIANTS:
- dark: low key lighting, deep shadows, strong contrast, moody atmosphere
- neutral: balanced lighting, soft shadows, natural light, moderate contrast
- intense: extreme contrast lighting, strong highlights, deep blacks, cinematic dramatic light

ENVIRONMENTS:
- inn: dark wooden seaside inn, old wood textures, dim lighting, candles as main light source, worn furniture, 18th century atmosphere
- road: dark coastal road, night atmosphere, wind, minimal visibility, rough terrain

CHARACTER RULES:
- If a character appears, add their FULL appearance at the START of full_prompt
- NEVER use generic terms like "young boy" or "pirate" — use exact descriptors
- Do NOT add "same character, consistent face, same design across frames" (causes multi-image)

Style guide:
${styleGuideText}

Output valid JSON:
{
  "episodes": [
    {
      "number": 1,
      "title": "Episode title",
      "summary": "Brief summary",
      "shots": [
        {
          "shot_number": 1,
          "character": "character_name or null",
          "shot_description": "anchor + micro-action description",
          "environment": "inn|road|ship|outdoor",
          "lighting": "dark|neutral|intense",
          "camera_angle": "close-up|medium shot|wide shot|extreme close-up",
          "full_prompt": "Complete prompt: [character if any], [pattern prompt], [environment], [style pack], [lighting]",
          "story_line": "The narration line for voice-over",
          "anchor": "The ONE visual element to focus on",
          "dialogue": "Character speech/dialogue for this shot (single line, max 150 chars, null if no dialogue)"
        }
      ]
    }
  ]
}

RULES:
- 20-25 shots per episode, 3-5 seconds each
- ONE idea per shot, ONE anchor per shot, ONE micro-action
- If the viewer can't understand the shot in <1 second → wrong pattern
- Always choose the MOST CONCRETE pattern
- Each episode 75-90 seconds total`;

  const userPrompt = `Project: "${projectName}"

STORYBOARD/SCRIPT:
${storyboardText}

Analyze this story and create a complete shot-by-shot production plan. Break it into episodes logically, then create detailed shots for each scene. Generate full ComfyUI-ready prompts for every shot following the style guide rules.

Return ONLY valid JSON, no other text.`;

  return llmJSON<ParsedProject>([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], settings);
}

/** Extract character profiles (name, role, description, appearance) from style guide or storyboard text */
export async function extractCharacterProfiles(
  text: string,
  knownCharacterNames: string[],
  settings?: PromptSettings | null,
): Promise<ParsedCharacter[]> {
  const nameList = knownCharacterNames.length ? `Characters to extract: ${knownCharacterNames.join(", ")}` : "Extract all main characters";
  const messages: Message[] = [
    {
      role: "user",
      content: `Extract character profiles from the following text. ${nameList}.

For each character return:
- name: exact character name
- description: personality, story role, backstory (2-3 sentences)
- appearance: detailed physical description for image generation (age, build, hair, eyes, clothing, distinguishing features — be very specific)
- role: one of protagonist / antagonist / supporting / minor

Return ONLY valid JSON array:
[{"name":"...","description":"...","appearance":"...","role":"..."}]

TEXT:
${text.slice(0, 6000)}`,
    },
  ];
  try {
    return await llmJSON<ParsedCharacter[]>(messages, settings);
  } catch {
    return [];
  }
}

export async function generateStoryFromPrompt(
  niche: string,
  prompt: string,
  projectName: string,
  episodeCount: number = 10,
  settings?: PromptSettings | null,
): Promise<GeneratedStory> {
  const systemPrompt = `You are an expert manhwa/webtoon production AI. You create complete stories from scratch with characters, episodes, and shot-by-shot production plans with ComfyUI-ready image generation prompts.

Your output must be a valid JSON object with this exact structure:
{
  "characters": [
    {
      "name": "Character Name",
      "description": "Background, personality, story role",
      "appearance": "Detailed physical appearance for image generation: age, build, hair, eyes, clothing, distinguishing features",
      "role": "protagonist|antagonist|supporting|minor"
    }
  ],
  "episodes": [
    {
      "number": 1,
      "title": "Episode title",
      "summary": "Brief episode summary",
      "shots": [
        {
          "shot_number": 1,
          "character": "character_name or null",
          "shot_description": "What happens in this shot",
          "environment": "where it takes place",
          "lighting": "dark|neutral|dramatic|warm|cold",
          "camera_angle": "close-up|medium shot|wide shot|extreme close-up|over-the-shoulder|bird's eye|low angle",
          "full_prompt": "Complete detailed ComfyUI prompt"
        }
      ]
    }
  ]
}

Rules for characters:
- Create 4-8 main/supporting characters with rich detailed appearances
- Appearance must be very specific: exact hair color/style, eye color, skin tone, build, clothing, distinguishing marks

Rules for full_prompt:
- ALWAYS start with the character name and their full appearance description if a character appears
- Do NOT add "same character, consistent face, same design across frames" (causes multi-image generation)
- Use V8.1 shot pattern system: [character], [pattern prompt], [environment], [style pack], [lighting]
- Append to ALL prompts: manhwa style, detailed linework, semi-realistic characters, sharp facial features, dramatic lighting, high contrast shadows, cinematic composition
- Each shot must have ONE clear anchor visible in <1 second
- 20-25 shots per episode, 3-5 seconds each
- Each episode should advance the plot meaningfully`;

  const userPrompt = `Project: "${projectName}"
Niche/Genre: ${niche}
Number of episodes: ${episodeCount}

USER PROMPT:
${prompt}

Create a complete ${niche} story based on this prompt. Design the characters first, then create ${episodeCount} episodes with detailed shots. Every shot prompt must reference the exact character appearance you defined.

Return ONLY valid JSON, no other text.`;

  return llmJSON<GeneratedStory>([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], settings);
}
