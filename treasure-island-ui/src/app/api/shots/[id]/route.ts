import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });
  const generations = await prisma.generation.findMany({
    where: { shot_id: id },
    orderBy: { created_at: "desc" },
  });
  return Response.json({ shot, generations });
}

const ALLOWED_FIELDS = [
  "character", "shot_description", "environment", "lighting", "camera_angle",
  "full_prompt", "negative_prompt", "seed", "width", "height", "steps", "status",
  "story_line", "dialogue", "anchor", "approved_video_id", "pipeline_model",
  "prompt_template_id", "interaction_type",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) data[key] = body[key];
  }
  try {
    const shot = await prisma.shot.update({ where: { id }, data });
    return Response.json(shot);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return Response.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}
