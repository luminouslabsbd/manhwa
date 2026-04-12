import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return Response.json({ error: "No form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const isVideo = file.type.startsWith("video/");
  const ext = isVideo ? ".mp4" : ".png";
  const filename = `custom_${randomUUID()}${ext}`;
  const dir = path.join(process.cwd(), "public", "generated", shot.project_id, id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

  const publicPath = `/generated/${shot.project_id}/${id}/${filename}`;

  if (isVideo) {
    // Store as a video generation record
    const gen = await prisma.generation.create({
      data: {
        id: randomUUID(), shot_id: id, type: "video",
        comfyui_prompt_id: null, status: "completed", seed: null,
        image_path: null, video_path: publicPath, audio_path: null,
        voice: null, error: null,
        created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      },
    });
    return Response.json({ ok: true, path: publicPath, generation_id: gen.id, type: "video" });
  } else {
    // Store as an image generation record
    const gen = await prisma.generation.create({
      data: {
        id: randomUUID(), shot_id: id, type: "image:custom",
        comfyui_prompt_id: null, status: "completed", seed: null,
        image_path: publicPath, video_path: null, audio_path: null,
        voice: null, error: null,
        created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      },
    });
    await prisma.shot.update({
      where: { id },
      data: { status: "done" },
    });
    return Response.json({ ok: true, path: publicPath, generation_id: gen.id, type: "image" });
  }
}
