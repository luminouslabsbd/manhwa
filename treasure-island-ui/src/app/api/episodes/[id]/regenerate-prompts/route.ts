import { load, save } from "@/lib/db";
import { llmText } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { renderTemplate, STYLE_PACK, LIGHTING_MAP, ENV_MAP } from "@/lib/template";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const useLLM: boolean = body.use_llm === true; // default false (rule-based)

  const db = await load();
  const ep = db.episodes?.find((e) => e.id === id);
  if (!ep) return Response.json({ error: "Episode not found" }, { status: 404 });

  // Get shots — if shot_id provided, process only that one; otherwise all
  const shots = db.shots.filter(
    (s) => s.episode_id === id &&
      (body.shot_id ? s.id === body.shot_id : (body.force || s.full_prompt?.includes("[SHOT PATTERN") || !s.full_prompt?.trim()))
  );

  if (!shots.length) return Response.json({ updated: 0, message: "No shots with placeholder prompts found" });

  // Build character appearance lookup
  const project = db.projects.find((p) => p.id === ep.project_id);
  const chars = (db.characters ?? []).filter((c) => c.project_id === ep.project_id);
  const charMap: Record<string, string> = {};
  for (const c of chars) {
    charMap[c.name.toLowerCase()] = c.appearance || c.description || c.name;
  }

  // Load prompt templates for this project
  let templateMap: Record<string, { formula: string; name: string }> = {};
  try {
    const templates = await prisma.promptTemplate.findMany({ where: { project_id: ep.project_id } });
    templateMap = Object.fromEntries(templates.map(t => [t.id, { formula: t.formula, name: t.name }]));
  } catch { /* template table may not exist yet */ }

  // Get prompt settings for LLM
  const settings = (db.prompt_settings ?? []).find((ps: { project_id: string }) => ps.project_id === ep.project_id) ?? null;

  let updated = 0;
  const errors: string[] = [];

  for (const shot of shots) {
    try {
      let full_prompt: string;

      // Check if shot has a template
      const tid = (shot as unknown as { prompt_template_id?: string }).prompt_template_id ?? null;
      const tmpl = tid ? templateMap[tid] ?? null : null;

      // Multi-char helper
      const charNames = (shot.character ?? "").split(",").map((n: string) => n.trim()).filter(Boolean);
      const buildCharBlock = (withAppearance: boolean) => charNames.map((name: string) => {
        const app = charMap[name.toLowerCase()];
        return withAppearance && app ? `${name}, ${app}` : name;
      }).join(", ");

      if (tmpl) {
        // Template-based rendering — pass combined appearance block as charAppearance
        const charAppearance = charNames.length > 0 ? buildCharBlock(true) : null;
        full_prompt = renderTemplate(tmpl.formula, shot, charAppearance);
      } else if (useLLM) {
        // Build character block
        const charBlock = charNames.length > 0
          ? charNames.map((name: string) => { const app = charMap[name.toLowerCase()]; return app ? `${name} — ${app}` : name; }).join(" | ")
          : "No character (environment/object shot)";
        const charBlockLabel = charNames.length > 1 ? `Characters: ${charBlock}` : `Character: ${charBlock}`;

        const envDesc = ENV_MAP[shot.environment?.toLowerCase() ?? ""] ?? shot.environment ?? "unspecified location";
        const lightDesc = LIGHTING_MAP[shot.lighting?.toLowerCase() ?? ""] ?? shot.lighting ?? "cinematic lighting";

        const prompt = `You are a ComfyUI prompt writer for a manhwa/anime production.

Project: ${project?.name ?? "Unknown"}
Shot ${shot.shot_number}: ${shot.shot_description}
Camera: ${shot.camera_angle}
Environment: ${envDesc}
Lighting: ${lightDesc}
${charBlockLabel}

Write a single ComfyUI image generation prompt (one line, no JSON, no explanation).
${charNames.length > 1 ? "Use BREAK keyword to separate character regions. Format: [shared context] BREAK [left: CharA action] BREAK [right: CharB action]" : "Structure: [character appearance if any], [shot action/composition], " + envDesc + ", " + STYLE_PACK + ", " + lightDesc}
Keep it under 200 words. Be specific and visual. Do NOT use bracket placeholders.`;

        full_prompt = (await llmText(prompt, settings)).trim();
        full_prompt = full_prompt.replace(/^["'`]+|["'`]+$/g, "").trim();
      } else {
        // Rule-based fallback — no LLM needed
        const charBlock = buildCharBlock(true);
        const envDesc = ENV_MAP[shot.environment?.toLowerCase() ?? ""] ?? shot.environment ?? "";
        const lightDesc = LIGHTING_MAP[shot.lighting?.toLowerCase() ?? ""] ?? shot.lighting ?? "cinematic lighting";
        const camDesc = shot.camera_angle ?? "medium shot";
        const charPrefix = charBlock ? `${charBlock}, ` : "";

        full_prompt = `${charPrefix}${shot.shot_description}, ${camDesc}, ${envDesc}, ${STYLE_PACK}, ${lightDesc}`.replace(/,\s*,/g, ",").trim();
      }

      shot.full_prompt = full_prompt;
      updated++;
    } catch (err) {
      errors.push(`Shot ${shot.shot_number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await save(db);
  return Response.json({ updated, total: shots.length, errors: errors.length ? errors : undefined });
}
