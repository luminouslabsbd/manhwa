import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const frames = await prisma.frame.findMany({
    where: { shot_id: id },
    orderBy: { frame_number: "asc" },
  });
  return Response.json(frames);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });

  // Auto-assign frame_number (max + 1)
  const existing = await prisma.frame.findMany({ where: { shot_id: id }, orderBy: { frame_number: "desc" }, take: 1 });
  const frame_number = (existing[0]?.frame_number ?? 0) + 1;

  try {
    const frame = await prisma.frame.create({
      data: {
        id: randomUUID(),
        shot_id: id,
        frame_number: body.frame_number ?? frame_number,
        description: body.description ?? "",
        prompt: body.prompt ?? "",
        needed: body.needed ?? true,
        image_path: null,
        video_path: null,
        status: "draft",
        ai_suggested: body.ai_suggested ?? false,
        created_at: new Date().toISOString(),
      },
    });
    return Response.json(frame, { status: 201 });
  } catch (e) {
    console.error("[frames POST]", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
