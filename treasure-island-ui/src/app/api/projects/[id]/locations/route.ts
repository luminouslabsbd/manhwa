import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locs = await prisma.location.findMany({
    where: { project_id: id },
    orderBy: { created_at: "asc" },
  });

  // Shot counts per location
  const shots = await prisma.shot.findMany({
    where: { project_id: id, location_id: { not: null } },
    select: { location_id: true },
  });
  const shotCount: Record<string, number> = {};
  for (const s of shots) {
    if (s.location_id) shotCount[s.location_id] = (shotCount[s.location_id] ?? 0) + 1;
  }

  return Response.json(locs.map(l => ({ ...l, shot_count: shotCount[l.id] ?? 0 })));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  const loc = await prisma.location.create({
    data: {
      id: randomUUID(),
      project_id: id,
      name,
      description: (body.description ?? "").trim(),
      reference_image: body.reference_image ?? null,
      created_at: new Date().toISOString(),
    },
  });
  return Response.json(loc, { status: 201 });
}
