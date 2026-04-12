import { NextRequest } from "next/server";
import { load, save } from "@/lib/db";
import { extractText } from "@/lib/parse-document";
import { parseStoryboardWithLLM, extractCharacterProfiles } from "@/lib/llm";
import { isV81Format, parseV81Storyboard, KNOWN_CHARACTERS } from "@/lib/parse-v81-storyboard";
import { randomUUID } from "crypto";

/**
 * Batch parse: splits storyboard by episode markers, parses each episode
 * individually through the LLM, extracts characters, and saves everything.
 *
 * POST body (multipart): storyboard file + optional style_guide
 * Returns SSE stream with progress updates.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const storyboardFile = form.get("storyboard") as File | null;
  if (!storyboardFile) return Response.json({ error: "storyboard required" }, { status: 400 });

  const storyboardText = await extractText(Buffer.from(await storyboardFile.arrayBuffer()), storyboardFile.name);
  const styleFile = form.get("style_guide") as File | null;
  let styleText = "";
  if (styleFile) {
    styleText = await extractText(Buffer.from(await styleFile.arrayBuffer()), styleFile.name);
    project.style_guide = styleText;
    project.style_guide_filename = styleFile.name;
  }
  project.storyboard_filename = storyboardFile.name;

  // Split storyboard by episode markers
  const epRegex = /EPISODE\s+(\d+)\s*[—–\-]\s*(.+)/gi;
  const matches: { num: number; title: string; pos: number }[] = [];
  let m;
  while ((m = epRegex.exec(storyboardText)) !== null) {
    matches.push({ num: parseInt(m[1]), title: m[2].trim(), pos: m.index });
  }

  if (!matches.length) {
    // No episode markers — treat as single batch
    matches.push({ num: 1, title: project.name, pos: 0 });
  }

  // Extract episode text chunks
  const chunks: { num: number; title: string; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].pos;
    const end = i + 1 < matches.length ? matches[i + 1].pos : storyboardText.length;
    chunks.push({ num: matches[i].num, title: matches[i].title, text: storyboardText.slice(start, end) });
  }

  // Clear old episodes/shots for this project
  const oldEpIds = db.episodes.filter((e) => e.project_id === id).map((e) => e.id);
  db.shots = db.shots.filter((s) => !oldEpIds.includes(s.episode_id));
  db.episodes = db.episodes.filter((e) => e.project_id !== id);
  await save(db);

  const settings = db.prompt_settings.find((s) => s.project_id === id) || null;
  const results: { episode: number; title: string; shots: number; error?: string }[] = [];

  // --- Hybrid: V8.1 structured format → direct parser (100% accurate) ---
  if (isV81Format(storyboardText)) {
    const v81Episodes = parseV81Storyboard(storyboardText);
    for (const ep of v81Episodes) {
      const freshDb = await load();
      const epId = randomUUID();
      freshDb.episodes.push({
        id: epId, project_id: id, number: ep.number,
        title: ep.title,
        summary: ep.summary || null,
        created_at: new Date().toISOString(),
      });
      for (const shot of ep.shots) {
        freshDb.shots.push({
          id: randomUUID(), episode_id: epId, project_id: id,
          shot_number: shot.shot_number,
          character: shot.character ?? null,
          shot_description: shot.shot_description,
          environment: shot.environment, lighting: shot.lighting,
          camera_angle: shot.camera_angle,
          full_prompt: shot.full_prompt,
          negative_prompt: "ugly, blurry, low quality, distorted, text, watermark, deformed, bad anatomy, nsfw",
          seed: Math.floor(Math.random() * 999999),
          width: 832, height: 480, steps: 25,
          status: "draft", approved_image_id: null, approved_video_id: null,
          created_at: new Date().toISOString(),
          story_line: shot.story_line ?? null,
          dialogue: shot.dialogue ?? null,
          anchor: shot.anchor ?? null,
        });
      }
      await save(freshDb);
      results.push({ episode: ep.number, title: ep.title, shots: ep.shots.length });
    }
  } else {
  // --- Fallback: raw story / unstructured → LLM parse ---
  for (const chunk of chunks) {
    try {
      const parsed = await parseStoryboardWithLLM(chunk.text, styleText, `${project.name} - Episode ${chunk.num}`, settings);
      const freshDb = await load();

      for (const ep of parsed.episodes) {
        const epId = randomUUID();
        freshDb.episodes.push({
          id: epId, project_id: id, number: chunk.num,
          title: ep.title || chunk.title,
          summary: ep.summary || null,
          created_at: new Date().toISOString(),
        });
        for (const shot of ep.shots) {
          freshDb.shots.push({
            id: randomUUID(), episode_id: epId, project_id: id,
            shot_number: shot.shot_number,
            character: shot.character ?? null,
            shot_description: shot.shot_description,
            environment: shot.environment, lighting: shot.lighting,
            camera_angle: shot.camera_angle,
            full_prompt: shot.full_prompt,
            negative_prompt: "ugly, blurry, low quality, distorted, text, watermark, deformed, bad anatomy, nsfw",
            seed: Math.floor(Math.random() * 999999),
            width: 832, height: 480, steps: 25,
            status: "draft", approved_image_id: null, approved_video_id: null,
            created_at: new Date().toISOString(),
            story_line: (shot as Record<string, unknown>).story_line as string ?? null,
            dialogue: (shot as Record<string, unknown>).dialogue as string ?? null,
            anchor: (shot as Record<string, unknown>).anchor as string ?? null,
          });
        }
        await save(freshDb);
        results.push({ episode: chunk.num, title: ep.title || chunk.title, shots: ep.shots.length });
      }
    } catch (e) {
      results.push({ episode: chunk.num, title: chunk.title, shots: 0, error: String(e).slice(0, 200) });
    }
  }
  } // end LLM fallback

  // Extract unique characters from all parsed shots
  const allDb = await load();
  const allShots = allDb.shots.filter((s) => s.project_id === id);
  const charNames = new Set<string>();
  for (const s of allShots) {
    if (s.character && s.character.trim()) charNames.add(s.character.trim());
  }

  // Create characters that don't already exist
  const existingChars = (allDb.characters || []).filter((c) => c.project_id === id);
  const existingNames = new Set(existingChars.map((c) => c.name.toLowerCase()));
  const newChars: string[] = [];

  // For characters NOT in KNOWN_CHARACTERS, try LLM extraction from style guide
  const unknownNames = [...charNames].filter(n => !existingNames.has(n.toLowerCase()) && !KNOWN_CHARACTERS[n]);
  let llmProfiles: Record<string, { description: string; appearance: string; role: string; reference_prompt: string }> = {};
  if (unknownNames.length && (styleText || storyboardText)) {
    try {
      const profilesArray = await extractCharacterProfiles(styleText || storyboardText, unknownNames, settings);
      for (const p of profilesArray) {
        llmProfiles[p.name] = {
          description: p.description,
          appearance: p.appearance,
          role: p.role,
          reference_prompt: `Character reference sheet, full body portrait, front view, clean white background, studio lighting, highly detailed manhwa style illustration. ${p.name}: ${p.appearance}. Consistent character design, neutral pose, clear visible features, full body from head to toe`,
        };
      }
    } catch { /* ignore LLM failure — characters still created with empty fields */ }
  }

  let changed = false;
  for (const name of charNames) {
    const known = KNOWN_CHARACTERS[name];
    const llm = llmProfiles[name];
    const existing = existingChars.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      allDb.characters.push({
        id: randomUUID(), project_id: id, name,
        description: known?.description ?? llm?.description ?? "",
        appearance: known?.appearance ?? llm?.appearance ?? "",
        role: known?.role ?? llm?.role ?? "",
        reference_prompt: known?.reference_prompt ?? llm?.reference_prompt ?? "",
        reference_image: null,
        seed: Math.floor(Math.random() * 999999),
        status: "draft",
        created_at: new Date().toISOString(),
      });
      newChars.push(name);
      changed = true;
    } else if (!existing.description && (known || llm)) {
      // Update existing character with empty profile
      const dbChar = allDb.characters.find(c => c.id === existing.id);
      if (dbChar) {
        dbChar.description = known?.description ?? llm?.description ?? "";
        dbChar.appearance = known?.appearance ?? llm?.appearance ?? "";
        dbChar.role = known?.role ?? llm?.role ?? "";
        dbChar.reference_prompt = known?.reference_prompt ?? llm?.reference_prompt ?? "";
        changed = true;
      }
    }
  }
  if (changed) await save(allDb);

  const totalShots = results.reduce((a, r) => a + r.shots, 0);
  return Response.json({
    ok: true,
    episodes: results.length,
    shots: totalShots,
    characters_found: [...charNames],
    characters_created: newChars,
    results,
  });
}
