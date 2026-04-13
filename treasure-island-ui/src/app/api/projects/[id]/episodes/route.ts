import { NextRequest } from "next/server";
import { load, save } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const episodes = db.episodes
    .filter((e) => e.project_id === id)
    .sort((a, b) => a.number - b.number)
    .map((e) => {
      const shots = db.shots.filter((s) => s.episode_id === e.id);
      return {
        ...e,
        shot_count: shots.length,
        done_count: shots.filter((s) => ["done", "approved"].includes(s.status)).length,
        approved_count: shots.filter((s) => s.status === "approved").length,
        video_count: shots.filter((s) => s.approved_video_id).length,
      };
    });
  return Response.json(episodes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();

  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title required" }, { status: 400 });

  const maxNum = db.episodes
    .filter((e) => e.project_id === id)
    .reduce((m, e) => Math.max(m, e.number), 0);

  const ep = {
    id: randomUUID(),
    project_id: id,
    number: maxNum + 1,
    title,
    summary: body.summary?.trim() || null,
    created_at: new Date().toISOString(),
  };

  db.episodes.push(ep);
  await save(db);
  return Response.json(ep, { status: 201 });
}
