import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gen = await prisma.generation.findUnique({ where: { id } });
  if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (gen.image_path) {
    try {
      const filePath = path.join(process.cwd(), "public", gen.image_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* ignore file errors */ }
  }

  await prisma.generation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
