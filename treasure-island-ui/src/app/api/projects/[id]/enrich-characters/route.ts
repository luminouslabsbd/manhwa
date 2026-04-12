import { load, save } from "@/lib/db";
import { llmText } from "@/lib/llm";
import { queuePrompt, buildImageWorkflow, getHost } from "@/lib/comfyui";
import { randomUUID } from "crypto";

/**
 * POST: Enrich all draft characters with LLM-generated descriptions,
 * then queue image generation for each.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const settings = db.prompt_settings.find((s) => s.project_id === id) || null;
  const characters = (db.characters || []).filter((c) => c.project_id === id);
  const drafts = characters.filter((c) => !c.appearance || c.status === "draft");

  if (!drafts.length) return Response.json({ ok: true, enriched: 0, message: "All characters already have descriptions" });

  // Gather context from shots
  const shots = db.shots.filter((s) => s.project_id === id);
  const charContext: Record<string, string[]> = {};
  for (const s of shots) {
    if (s.character) {
      if (!charContext[s.character]) charContext[s.character] = [];
      if (charContext[s.character].length < 3) {
        charContext[s.character].push(s.shot_description || s.full_prompt.slice(0, 100));
      }
    }
  }

  // Ask LLM to generate appearance for all characters at once
  const charList = drafts.map((c) => {
    const ctx = charContext[c.name]?.join("; ") || "no context";
    return `- ${c.name} (appears in: ${ctx})`;
  }).join("\n");

  const prompt = `You are creating character designs for a manhwa-style Treasure Island adaptation.

For each character below, provide a JSON array with detailed visual descriptions.

Characters:
${charList}

Return ONLY valid JSON array:
[
  {
    "name": "Character Name",
    "description": "Background and personality",
    "appearance": "Detailed physical: age, build, hair color/style, eye color, skin, clothing, distinguishing features. Be VERY specific.",
    "role": "protagonist|antagonist|supporting|minor"
  }
]

Rules:
- Appearance must be specific enough for image generation (no vague terms)
- Include clothing details (18th century pirate era)
- Include distinguishing features (scars, accessories, etc.)
- Keep descriptions consistent with Treasure Island characters`;

  try {
    const response = await llmText(prompt, settings);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");

    const enriched = JSON.parse(jsonMatch[0]) as Array<{
      name: string; description: string; appearance: string; role: string;
    }>;

    // Update characters in DB
    const freshDb = await load();
    let updated = 0;
    for (const e of enriched) {
      const char = (freshDb.characters || []).find(
        (c) => c.project_id === id && c.name.toLowerCase() === e.name.toLowerCase()
      );
      if (char) {
        char.description = e.description || char.description;
        char.appearance = e.appearance || char.appearance;
        char.role = e.role || char.role;
        char.reference_prompt = `Character reference sheet, full body portrait, front view, clean background, studio lighting, highly detailed manhwa style illustration. ${char.name}: ${char.appearance}. Neutral pose, clear features, white background`;
        updated++;
      }
    }
    await save(freshDb);

    // Queue image generation for all enriched characters
    const host = getHost();
    const modelOverride = project.pipeline_model;
    let queued = 0;
    const genDb = await load();

    for (const char of (genDb.characters || []).filter((c) => c.project_id === id && c.appearance)) {
      try {
        const prompt = char.reference_prompt || `${char.name}, ${char.appearance}, character portrait, manhwa style, clean background`;
        const seed = Math.floor(Math.random() * 999999);
        const wf = buildImageWorkflow(prompt, seed, 768, 1024, 25, modelOverride);
        const { prompt_id } = await queuePrompt(wf, host);
        genDb.generations.push({
          id: randomUUID(), shot_id: char.id, type: "image",
          comfyui_prompt_id: prompt_id, status: "running", seed,
          image_path: null, video_path: null, error: null,
          created_at: new Date().toISOString(), completed_at: null,
        });
        char.status = "generating";
        char.seed = seed;
        queued++;
      } catch { /* skip failed queue */ }
    }
    await save(genDb);

    return Response.json({ ok: true, enriched: updated, queued, characters: enriched.map((e) => e.name) });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 500) }, { status: 500 });
  }
}
