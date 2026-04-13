import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const DEFAULT_MODEL = process.env.COMFYUI_MODEL || "bigLust_v16.safetensors";

function resolveModelName(type: string): string {
  if (type.startsWith("image:")) return type.replace("image:", "");
  return DEFAULT_MODEL;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chars = await prisma.character.findMany({ where: { project_id: id } });
  if (!chars.length) return Response.json([]);

  const charIds = chars.map(c => c.id);
  // Character generations use shot_id = character.id — must query directly
  const allGens = await prisma.generation.findMany({
    where: { shot_id: { in: charIds } },
    orderBy: { created_at: "asc" },
  });

  const result = chars.map(c => {
    const gens = allGens.filter(g => g.shot_id === c.id);
    const imageGens = gens.filter(g => g.type.startsWith("image"));
    const latestCompletedGen = imageGens
      .filter(g => g.status === "completed")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    // Effective model: explicit pipeline_model → latest generation's model → env default
    const latest_model: string | null = c.pipeline_model
      ?? (latestCompletedGen ? resolveModelName(latestCompletedGen.type) : null);
    return {
      ...c,
      generation_count: imageGens.length,
      latest_image: c.reference_image ?? latestCompletedGen?.image_path ?? null,
      latest_model,
      generations: imageGens.map(g => ({
        id: g.id, type: g.type, model: resolveModelName(g.type),
        status: g.status, image_path: g.image_path ?? null, created_at: g.created_at,
      })),
      shot_count: 0, // filled below
    };
  });
  // Add shot counts per character
  const shots = await prisma.shot.findMany({
    where: { project_id: id },
    select: { character: true },
  });
  const shotCountMap: Record<string, number> = {};
  for (const s of shots) {
    if (s.character) shotCountMap[s.character] = (shotCountMap[s.character] ?? 0) + 1;
  }
  const withCounts = result.map(c => ({ ...c, shot_count: shotCountMap[c.name] ?? 0 }));

  return Response.json(withCounts);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const char = await prisma.character.create({
    data: {
      id: randomUUID(),
      project_id: id,
      name: body.name ?? "Unnamed",
      description: body.description ?? "",
      appearance: body.appearance ?? "",
      role: body.role ?? "",
      reference_prompt: body.reference_prompt ?? "",
      reference_image: null,
      seed: body.seed ?? Math.floor(Math.random() * 999999),
      status: "draft",
      created_at: new Date().toISOString(),
    },
  });
  return Response.json(char, { status: 201 });
}
