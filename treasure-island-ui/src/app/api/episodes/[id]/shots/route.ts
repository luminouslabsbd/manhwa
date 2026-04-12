import { load } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { resolveAllVars } from "@/lib/template";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const shots = db.shots
    .filter((s) => s.episode_id === id)
    .sort((a, b) => a.shot_number - b.shot_number);

  const ep = db.episodes.find((e) => e.id === id);
  const projectId = ep?.project_id;

  const shotIds = shots.map(s => s.id);
  let allFrames: Awaited<ReturnType<typeof prisma.frame.findMany>> = [];
  try {
    if (shotIds.length) {
      allFrames = await prisma.frame.findMany({ where: { shot_id: { in: shotIds } }, orderBy: { frame_number: "asc" } });
    }
  } catch { /* frames table may not be accessible yet — degrade gracefully */ }

  // Build character appearance lookup
  const chars = projectId ? db.characters.filter(c => c.project_id === projectId) : [];
  const charAppMap: Record<string, string> = {};
  for (const c of chars) {
    charAppMap[c.name.toLowerCase()] = c.appearance || c.description || "";
  }

  // Load prompt templates
  let templateMap: Record<string, { formula: string; name: string }> = {};
  try {
    if (projectId) {
      const templates = await prisma.promptTemplate.findMany({ where: { project_id: projectId } });
      templateMap = Object.fromEntries(templates.map(t => [t.id, { formula: t.formula, name: t.name }]));
    }
  } catch { /* template table may not exist yet */ }

const result = shots.map((s) => {
    const gens = db.generations.filter((g) => g.shot_id === s.id);
    const imageGens = gens.filter((g) => g.type === "image" || g.type.startsWith("image:"));
    const latestImg = imageGens.filter((g) => g.status === "completed").pop();
    const latestVid = gens.filter((g) => g.type === "video" && g.status === "completed").pop();
    const frames = allFrames.filter(f => f.shot_id === s.id);

    const tid = (s as unknown as { prompt_template_id?: string }).prompt_template_id ?? null;
    const tmpl = tid ? templateMap[tid] ?? null : null;
    // Multi-character: build per-char blocks for [char1]/[char2] template vars
    const charNames = (s.character ?? "").split(",").map((n: string) => n.trim()).filter(Boolean);
    const charBlockFn = (name: string) => { const app = charAppMap[name.toLowerCase()]; return app ? `${name}, ${app}` : name; };
    const charAppearance = charNames.length > 0 ? charNames.map(charBlockFn).join(", ") : null;
    const shotForTemplate = {
      ...s,
      _char1_block: charNames[0] ? charBlockFn(charNames[0]) : undefined,
      _char2_block: charNames[1] ? charBlockFn(charNames[1]) : undefined,
      _char1_name:  charNames[0],
      _char2_name:  charNames[1],
    };
    const template_resolved = resolveAllVars(shotForTemplate, charAppearance);

    return {
      ...s,
      approved_image_ids: s.approved_image_ids ?? (s.approved_image_id ? [s.approved_image_id] : []),
      attempt_count: gens.length,
      latest_image: latestImg?.image_path ?? null,
      latest_video: latestVid?.video_path ?? null,
      frames,
      prompt_template_id: tid,
      prompt_template_formula: tmpl?.formula ?? null,
      prompt_template_name: tmpl?.name ?? null,
      template_resolved,
      generations: gens.map(g => ({
        id: g.id, type: g.type,
        model: (() => {
          if (g.type === "image") return (process.env.COMFYUI_MODEL || "bigLust_v16").replace(/\.(safetensors|ckpt|pt)$/i, "");
          if (!g.type.startsWith("image:")) return g.type;
          const inner = g.type.slice(6);
          const framePos = inner.indexOf(":frame:");
          const modelPart = framePos >= 0 ? inner.slice(0, framePos) : inner;
          if (!modelPart || modelPart.startsWith("frame:")) return (process.env.COMFYUI_MODEL || "bigLust_v16").replace(/\.(safetensors|ckpt|pt)$/i, "");
          return modelPart.replace(/\.(safetensors|ckpt|pt)$/i, "");
        })(),
        status: g.status, seed: g.seed ?? null, image_path: g.image_path, video_path: g.video_path,
        audio_path: g.audio_path, voice: g.voice ?? null, error: g.error ?? null, ref_image: g.ref_image ?? null,
        created_at: g.created_at, completed_at: g.completed_at ?? null,
      })),
    };
  });
  return Response.json(result);
}
