import { load, save } from "@/lib/db";
import { queuePrompt, buildImageWorkflow, uploadImage, getHost } from "@/lib/comfyui";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// GET — return current base image info
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    base_image_path: project.base_image_path,
    base_image_comfyui: project.base_image_comfyui,
    base_image_prompt: project.base_image_prompt,
    base_image_seed: project.base_image_seed,
    pipeline_model: project.pipeline_model,
  });
}

// POST — generate a new base image via ComfyUI, or upload one
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentType = req.headers.get("content-type") || "";
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const host = getHost();
  const modelOverride = project.pipeline_model;

  // ── Upload mode (multipart form) ──
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return Response.json({ error: "No image file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fname = `base_${id}.png`;

    // Save locally
    const dir = path.join(process.cwd(), "public", "generated", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "base.png"), buffer);

    // Upload to ComfyUI
    const uploadData = await uploadImage(buffer, fname, host);

    project.base_image_path = `/generated/${id}/base.png`;
    project.base_image_comfyui = uploadData.name;
    project.base_image_prompt = formData.get("prompt") as string || null;
    project.base_image_seed = null;
    await save(db);

    return Response.json({ ok: true, mode: "upload", base_image_path: project.base_image_path, comfyui_name: uploadData.name });
  }

  // ── Generate mode (JSON body) ──
  const body = await req.json().catch(() => ({}));
  const prompt = body.prompt || `${project.name}, masterpiece, best quality, detailed anime illustration, manhwa style`;
  const seed = body.seed ?? Math.floor(Math.random() * 999999);
  const width = body.width ?? 832;
  const height = body.height ?? 480;

  const wf = buildImageWorkflow(prompt, seed, width, height, 20, modelOverride);
  const { prompt_id } = await queuePrompt(wf, host);

  // Create a generation record for tracking
  const genId = randomUUID();
  db.generations.push({
    id: genId, shot_id: `base_${id}`, type: "base_image",
    comfyui_prompt_id: prompt_id, status: "running", seed,
    image_path: null, video_path: null, error: null,
    created_at: new Date().toISOString(), completed_at: null,
  });

  project.base_image_prompt = prompt;
  project.base_image_seed = seed;
  await save(db);

  return Response.json({ ok: true, mode: "generate", prompt_id, generation_id: genId, seed });
}

// DELETE — remove the base image
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  // Delete local file
  if (project.base_image_path) {
    try {
      const filePath = path.join(process.cwd(), "public", project.base_image_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* ignore */ }
  }

  // Remove from DB
  project.base_image_path = null;
  project.base_image_comfyui = null;
  project.base_image_prompt = null;
  project.base_image_seed = null;

  // Remove the base_image generation record
  db.generations = db.generations.filter(g => g.shot_id !== `base_${id}`);
  await save(db);

  return Response.json({ ok: true });
}

// PATCH — update pipeline model or base image settings
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  if ("pipeline_model" in body) project.pipeline_model = body.pipeline_model;
  if ("base_image_prompt" in body) project.base_image_prompt = body.base_image_prompt;
  await save(db);

  return Response.json({ ok: true });
}
