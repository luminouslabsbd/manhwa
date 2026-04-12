import { NextRequest } from "next/server";
import { load, save, type Character } from "@/lib/db";
import { generateStoryFromPrompt } from "@/lib/llm";
import { extractText } from "@/lib/parse-document";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const niche = (form.get("niche") as string) || "adventure";
  const prompt = (form.get("prompt") as string) || "";
  const episodeCount = parseInt((form.get("episode_count") as string) || "10", 10);
  const file = form.get("file") as File | null;

  // Build the story prompt from file content or user prompt
  let storyPrompt = prompt;
  if (file) {
    const fileText = await extractText(Buffer.from(await file.arrayBuffer()), file.name);
    storyPrompt = fileText + (prompt ? `\n\nAdditional instructions: ${prompt}` : "");
  }

  if (!storyPrompt.trim()) {
    return Response.json({ error: "Provide a prompt or upload a file" }, { status: 400 });
  }

  try {
    // Get project prompt settings for LLM provider selection
    const settings = db.prompt_settings.find((s) => s.project_id === id) || null;
    const story = await generateStoryFromPrompt(niche, storyPrompt, project.name, episodeCount, settings);

    // Remove old data for this project
    const oldEpIds = db.episodes.filter((e) => e.project_id === id).map((e) => e.id);
    db.shots = db.shots.filter((s) => !oldEpIds.includes(s.episode_id));
    db.episodes = db.episodes.filter((e) => e.project_id !== id);
    db.characters = (db.characters ?? []).filter((c) => c.project_id !== id);
    db.generations = db.generations.filter((g) => {
      const isProjectShot = db.shots.some((s) => s.id === g.shot_id && s.project_id === id);
      const isProjectChar = (db.characters ?? []).some((c) => c.id === g.shot_id && c.project_id === id);
      return !isProjectShot && !isProjectChar;
    });

    // Create characters
    for (const c of story.characters) {
      const char: Character = {
        id: randomUUID(),
        project_id: id,
        name: c.name,
        description: c.description,
        appearance: c.appearance,
        role: c.role,
        reference_prompt: `Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed anime/manhwa style illustration. ${c.name}: ${c.appearance}. Consistent character design, neutral pose, clear visible features, full body from head to toe`,
        reference_image: null,
        seed: Math.floor(Math.random() * 999999),
        status: "draft",
        created_at: new Date().toISOString(),
      };
      if (!db.characters) db.characters = [];
      db.characters.push(char);
    }

    // Create episodes and shots
    for (const ep of story.episodes) {
      const epId = randomUUID();
      db.episodes.push({
        id: epId, project_id: id, number: ep.number, title: ep.title,
        summary: ep.summary, created_at: new Date().toISOString(),
      });
      for (const shot of ep.shots) {
        db.shots.push({
          id: randomUUID(), episode_id: epId, project_id: id, shot_number: shot.shot_number,
          character: shot.character ?? null, shot_description: shot.shot_description,
          environment: shot.environment, lighting: shot.lighting, camera_angle: shot.camera_angle,
          full_prompt: shot.full_prompt, negative_prompt: "blurry, low quality, distorted, watermark",
          seed: Math.floor(Math.random() * 999999), width: 1024, height: 576, steps: 8,
          status: "draft", approved_image_id: null, approved_video_id: null, created_at: new Date().toISOString(),
        });
      }
    }

    await save(db);
    const totalShots = story.episodes.reduce((a, e) => a + e.shots.length, 0);
    return Response.json({
      ok: true,
      characters: story.characters.length,
      episodes: story.episodes.length,
      shots: totalShots,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
