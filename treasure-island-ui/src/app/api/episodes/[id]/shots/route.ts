import { NextRequest } from "next/server";
import { load, save } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { resolveAllVars } from "@/lib/template";
import { randomUUID } from "crypto";

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

  // Load locations — used to resolve [location] var in templates
  let locationMap: Record<string, { name: string; description: string; reference_image: string | null }> = {};
  try {
    if (projectId) {
      const locs = await prisma.location.findMany({ where: { project_id: projectId } });
      locationMap = Object.fromEntries(locs.map(l => [l.id, { name: l.name, description: l.description, reference_image: l.reference_image }]));
    }
  } catch { /* locations table may not exist on older DBs */ }

const result = shots.map((s) => {
    const gens = db.generations.filter((g) => g.shot_id === s.id);
    const imageGens = gens.filter((g) => g.type === "image" || g.type.startsWith("image:"));
    const latestImg = imageGens.filter((g) => g.status === "completed").pop();
    const videoGens = gens.filter((g) => (g.type === "video" || g.type.startsWith("video:")) && g.status === "completed");
    const approvedVid = s.approved_video_id ? videoGens.find((g) => g.id === s.approved_video_id) : null;
    const latestVid = approvedVid ?? videoGens[videoGens.length - 1];
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
    const locId = (s as unknown as { location_id?: string | null }).location_id ?? null;
    const loc = locId ? locationMap[locId] ?? null : null;
    const template_resolved = resolveAllVars(shotForTemplate, charAppearance, loc?.description ?? null);

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
      location_id: locId,
      location_name: loc?.name ?? null,
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();

  const ep = db.episodes.find((e) => e.id === id);
  if (!ep) return Response.json({ error: "Episode not found" }, { status: 404 });

  const body = await req.json();
  const shot_description = body.shot_description?.trim();
  if (!shot_description) return Response.json({ error: "shot_description required" }, { status: 400 });

  const maxNum = db.shots
    .filter((s) => s.episode_id === id)
    .reduce((m, s) => Math.max(m, s.shot_number), 0);

  const shot = {
    id: randomUUID(),
    episode_id: id,
    project_id: ep.project_id,
    shot_number: maxNum + 1,
    character: body.character?.trim() || null,
    location_id: body.location_id?.trim() || null,
    shot_description,
    environment: body.environment?.trim() || "unspecified",
    lighting: body.lighting?.trim() || "natural",
    camera_angle: body.camera_angle?.trim() || "medium shot",
    full_prompt: body.full_prompt?.trim() || shot_description,
    negative_prompt: body.negative_prompt?.trim() || "ugly, blurry, low quality, distorted, text, watermark",
    seed: null,
    width: body.width ?? 832,
    height: body.height ?? 1216,
    steps: body.steps ?? 25,
    status: "draft",
    approved_image_id: null,
    approved_image_ids: [],
    approved_video_id: null,
    approved_tts_id: null,
    story_line: body.story_line?.trim() || null,
    dialogue: body.dialogue?.trim() || null,
    anchor: body.anchor?.trim() || null,
    audio_path: null,
    video_audio_path: null,
    pipeline_model: body.pipeline_model?.trim() || null,
    prompt_template_id: null,
    interaction_type: null,
    created_at: new Date().toISOString(),
  };

  db.shots.push(shot);
  await save(db);
  return Response.json(shot, { status: 201 });
}
