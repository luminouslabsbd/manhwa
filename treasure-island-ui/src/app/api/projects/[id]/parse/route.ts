import { NextRequest } from "next/server";
import { load, save } from "@/lib/db";
import { extractText } from "@/lib/parse-document";
import { parseStoryboardWithLLM } from "@/lib/llm";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const storyboardFile = form.get("storyboard") as File | null;
  const styleFile = form.get("style_guide") as File | null;
  if (!storyboardFile) return Response.json({ error: "storyboard required" }, { status: 400 });

  const storyboardText = await extractText(Buffer.from(await storyboardFile.arrayBuffer()), storyboardFile.name);
  let styleText = "";
  if (styleFile) {
    styleText = await extractText(Buffer.from(await styleFile.arrayBuffer()), styleFile.name);
    project.style_guide = styleText;
    project.style_guide_filename = styleFile.name;
  }
  project.storyboard_filename = storyboardFile.name;

  const settings = db.prompt_settings.find((s) => s.project_id === id) || null;
  const parsed = await parseStoryboardWithLLM(storyboardText, styleText, project.name, settings);

  // Remove old episodes/shots
  const oldEpIds = db.episodes.filter((e) => e.project_id === id).map((e) => e.id);
  db.shots = db.shots.filter((s) => !oldEpIds.includes(s.episode_id));
  db.episodes = db.episodes.filter((e) => e.project_id !== id);

  for (const ep of parsed.episodes) {
    const epId = randomUUID();
    db.episodes.push({ id: epId, project_id: id, number: ep.number, title: ep.title, summary: ep.summary, created_at: new Date().toISOString() });
    for (const shot of ep.shots) {
      db.shots.push({
        id: randomUUID(), episode_id: epId, project_id: id, shot_number: shot.shot_number,
        character: shot.character ?? null, shot_description: shot.shot_description,
        environment: shot.environment, lighting: shot.lighting, camera_angle: shot.camera_angle,
        full_prompt: shot.full_prompt, negative_prompt: "ugly, blurry, low quality, distorted, text, watermark, deformed, bad anatomy, nsfw",
        seed: Math.floor(Math.random() * 999999), width: 832, height: 480, steps: 25,
        status: "draft", approved_image_id: null, approved_video_id: null, created_at: new Date().toISOString(),
        story_line: (shot as Record<string, unknown>).story_line as string ?? null,
        dialogue: (shot as Record<string, unknown>).dialogue as string ?? null,
        anchor: (shot as Record<string, unknown>).anchor as string ?? null,
      });
    }
  }
  await save(db);
  const totalShots = parsed.episodes.reduce((a, e) => a + e.shots.length, 0);
  return Response.json({ ok: true, episodes: parsed.episodes.length, shots: totalShots });
}
