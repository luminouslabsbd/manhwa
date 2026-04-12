import { load } from "@/lib/db";
import { getHost } from "@/lib/comfyui";
import { addGenerationJob } from "@/lib/gen-queue";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  const modelOverride = project?.pipeline_model ?? undefined;
  const shots = db.shots.filter((s) => s.project_id === id && ["draft", "failed"].includes(s.status));
  if (!shots.length) return Response.json({ ok: true, queued: 0, message: "No pending shots" });

  const host = getHost();
  // Verify ComfyUI is reachable
  try {
    await fetch(`${host}/system_stats`, { signal: AbortSignal.timeout(5000) });
  } catch {
    return Response.json({ error: "Cannot reach ComfyUI" }, { status: 500 });
  }

  let queued = 0;
  for (const shot of shots) {
    const seed = shot.seed ?? Math.floor(Math.random() * 999999);
    const model = modelOverride ?? "default";
    await addGenerationJob({
      shot_id: shot.id,
      project_id: id,
      model,
      seed,
      full_prompt: shot.full_prompt,
      width: shot.width,
      height: shot.height,
      steps: shot.steps,
    });
    await prisma.shot.update({ where: { id: shot.id }, data: { status: "generating", seed } });
    queued++;
  }

  return Response.json({ ok: true, queued, total: shots.length });
}
