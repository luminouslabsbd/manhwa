import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const frame = await prisma.frame.findUnique({ where: { id } });
  if (!frame) return Response.json({ error: "Not found" }, { status: 404 });

  const shot = await prisma.shot.findUnique({ where: { id: frame.shot_id } });
  if (!shot) return Response.json({ error: "Shot not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return Response.json({ error: "No form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const isVideo = file.type.startsWith("video/");
  const ext = isVideo ? ".mp4" : ".png";
  const filename = `frame_${id}${ext}`;
  const dir = path.join(process.cwd(), "public", "generated", shot.project_id, frame.shot_id, "frames");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

  const publicPath = `/generated/${shot.project_id}/${frame.shot_id}/frames/${filename}`;

  await prisma.frame.update({
    where: { id },
    data: {
      [isVideo ? "video_path" : "image_path"]: publicPath,
      status: "done",
    },
  });

  return Response.json({ ok: true, path: publicPath, type: isVideo ? "video" : "image" });
}
