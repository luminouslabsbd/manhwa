import { load, save, PromptSettings } from "@/lib/db";
import { chat, resolveConfig } from "@/lib/llm-provider";
import { INTERACTION_SPATIAL, ENV_MAP, LIGHTING_MAP, STYLE_PACK } from "@/lib/template";

function buildStyleGuide(ps: PromptSettings): string {
  const parts: string[] = [];
  if (ps.art_style) parts.push(`Art style: ${ps.art_style}`);
  if (ps.quality_tags) parts.push(`Quality: ${ps.quality_tags}`);
  if (ps.custom_prefix) parts.push(`Prefix: ${ps.custom_prefix}`);
  if (ps.custom_suffix) parts.push(`Suffix: ${ps.custom_suffix}`);
  return parts.join("\n");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const prevShot = body.prev_shot ?? null;
  const nextShot = body.next_shot ?? null;

  const db = await load();
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  const project = db.projects.find((p) => p.id === shot.project_id);
  const settings = db.prompt_settings.find((s) => s.project_id === shot.project_id) ?? null;

  // Resolve multiple characters
  const charNames = (shot.character ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const charDetails = charNames.map(name => {
    const c = (db.characters ?? []).find(
      ch => ch.project_id === shot.project_id && ch.name.toLowerCase() === name.toLowerCase()
    );
    return {
      name: c?.name ?? name,
      appearance: c?.appearance ?? "",
      hasRef: !!(c?.reference_image || (c as Record<string, unknown> | undefined)?.latest_image),
    };
  });

  const isMultiChar = charDetails.length > 1;
  const itype = (shot as Record<string, unknown>).interaction_type as string | null ?? null;
  const spatial = itype ? INTERACTION_SPATIAL[itype] ?? null : null;

  const envDesc = ENV_MAP[shot.environment?.toLowerCase() ?? ""] ?? shot.environment ?? "";
  const lightDesc = LIGHTING_MAP[shot.lighting?.toLowerCase() ?? ""] ?? shot.lighting ?? "";
  const styleGuide = settings ? buildStyleGuide(settings) : "";

  // Build char section for system prompt
  const charSection = charDetails.length === 0
    ? "No specific character."
    : charDetails.map((c, i) => [
        `[char${i + 1}] ${c.name}`,
        c.appearance ? `  Appearance: ${c.appearance}` : "  Appearance: (none — use name only)",
        c.hasRef ? "  Reference: ✓ IP-Adapter image available" : "  Reference: ✗ MUST embed full appearance in prompt",
      ].join("\n")).join("\n\n");

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = isMultiChar ? `You are an expert ComfyUI / Stable Diffusion prompt engineer for manhwa animation.
You MUST output a BREAK-structured regional prompt for a ${charDetails.length}-character scene.

OUTPUT FORMAT (strict):
[shared context line]
BREAK
[char1 region]
BREAK
[char2 region]

RULES:
- Output ONLY the prompt — no explanation, no JSON, no markdown
- Line 1: environment + style + lighting + camera (shared, no character names)
- After each BREAK: spatial position + character appearance + their action in this shot
- Embed full appearance for any character WITHOUT a reference image — the model is blind to them otherwise
- Style: ${STYLE_PACK.split(",").slice(0, 4).join(",")}
- Characters with reference images: still include 2-3 key appearance anchors
${spatial ? `- Spatial layout: char1 is ${spatial.left} | char2 is ${spatial.right}` : "- Infer spatial layout from the shot description"}
- Keep each region under 40 words, dense visual tokens only`
  : `You are an expert ComfyUI / Stable Diffusion prompt engineer for manhwa animation.
Generate a single rich image generation prompt from the shot details.

RULES:
- Output ONLY the prompt — no explanation, no quotes, no prefixes
- Be cinematically specific: camera angle, depth, emotion, lighting
- Embed character appearance directly as comma-separated tokens
- ${charDetails[0]?.hasRef ? "Character reference image available (IP-Adapter). Include 2-3 key appearance anchors." : "NO reference image — MUST embed full appearance description or character will look random."}
- Keep to 1–3 dense sentences of comma-separated visual descriptors
- Style: ${STYLE_PACK.split(",").slice(0, 4).join(",")}`;

  // ── User prompt ────────────────────────────────────────────────────────────
  const userPrompt = `Project: "${project?.name ?? "Untitled"}"
Shot S${String(shot.shot_number ?? "?").padStart(2, "0")}: ${shot.shot_description}
Camera: ${shot.camera_angle}
Environment: ${envDesc}
Lighting: ${lightDesc}
${itype ? `Interaction type: ${itype}${spatial ? ` (${spatial.left} / ${spatial.right})` : ""}` : ""}
${shot.story_line ? `Story context: ${shot.story_line}` : ""}
${shot.anchor ? `Key action: ${shot.anchor}` : ""}
${shot.dialogue ? `Dialogue: "${shot.dialogue}"` : ""}

Characters:
${charSection}
${prevShot ? `\nPrevious shot (S${String(prevShot.shot_number ?? "?").padStart(2, "0")}): ${prevShot.full_prompt ?? prevShot.shot_description ?? ""}` : ""}
${nextShot ? `\nNext shot (S${String(nextShot.shot_number ?? "?").padStart(2, "0")}): ${nextShot.full_prompt ?? nextShot.shot_description ?? ""}` : ""}
${styleGuide ? `\nStyle guide:\n${styleGuide}` : ""}

${isMultiChar ? "Generate the BREAK-structured regional prompt:" : "Generate the image prompt:"}`;

  try {
    const config = resolveConfig(settings, "content");
    const newPrompt = await chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], config);
    const trimmed = newPrompt.trim().replace(/^["']|["']$/g, "");

    shot.full_prompt = trimmed;
    await save(db);

    return Response.json({ ok: true, full_prompt: trimmed, is_multi_char: isMultiChar, interaction_type: itype });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
