import { load, save, type Character } from "@/lib/db";
import { randomUUID } from "crypto";

const DEFAULT_MODEL = process.env.COMFYUI_MODEL || "bigLust_v16.safetensors";

function resolveModelName(type: string): string {
  if (type.startsWith("image:")) return type.replace("image:", "");
  return DEFAULT_MODEL; // plain "image" type was generated with the default model
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const chars = (db.characters ?? []).filter((c) => c.project_id === id);
  // Attach generation count per character
  const result = chars.map((c) => {
    const gens = db.generations.filter((g) => g.shot_id === c.id);
    const imageGens = gens.filter((g) => g.type.startsWith("image"));
    return {
      ...c,
      generation_count: imageGens.length,
      latest_image: c.reference_image ?? imageGens.filter((g) => g.status === "completed").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.image_path ?? null,
      // All image generations (running + completed + failed) so UI can show placeholders
      generations: imageGens
        .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
        .map((g) => ({
          id: g.id,
          type: g.type,
          model: resolveModelName(g.type),
          status: g.status,
          image_path: g.image_path ?? null,
          created_at: g.created_at,
        })),
    };
  });
  return Response.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await load();
  if (!db.characters) db.characters = [];

  const char: Character = {
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
  };
  db.characters.push(char);
  await save(db);
  return Response.json(char, { status: 201 });
}
