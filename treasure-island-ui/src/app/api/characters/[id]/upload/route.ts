import { load, save } from "@/lib/db";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const char = db.characters.find(c => c.id === id);
  if (!char) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return Response.json({ error: "No form data" }, { status: 400 });
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const filename = `char_custom_${randomUUID()}.png`;
  const dir = path.join(process.cwd(), "public", "generated", char.project_id, "characters");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const publicPath = `/generated/${char.project_id}/characters/${filename}`;

  // Also create a generation record for tracking
  db.generations.push({
    id: randomUUID(), shot_id: id, type: "image:custom",
    comfyui_prompt_id: null, status: "completed", seed: null,
    image_path: publicPath, video_path: null, error: null,
    created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  });

  // Update character's latest_image if not set
  (char as Record<string, unknown>).latest_image = publicPath;
  char.status = "done";
  await save(db);

  return Response.json({ ok: true, path: publicPath });
}
