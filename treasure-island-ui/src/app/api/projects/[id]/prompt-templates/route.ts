import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { DEFAULT_FORMULA } from "@/lib/template";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const templates = await prisma.promptTemplate.findMany({
    where: { project_id: id },
    orderBy: { created_at: "asc" },
  });
  return Response.json(templates);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body.is_default) {
    await prisma.promptTemplate.updateMany({ where: { project_id: id }, data: { is_default: false } });
  }
  const tmpl = await prisma.promptTemplate.create({
    data: {
      id: randomUUID(),
      project_id: id,
      name: body.name ?? "Untitled Template",
      formula: body.formula ?? DEFAULT_FORMULA,
      is_default: body.is_default ?? false,
      created_at: new Date().toISOString(),
    },
  });
  return Response.json(tmpl, { status: 201 });
}
