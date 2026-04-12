import { NextRequest } from "next/server";
import { load, save } from "@/lib/db";
import { getSessionForApi } from "@/lib/dal";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await getSessionForApi();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = await load(session.userId);
  const projects = db.projects.map((p) => {
    const shots = db.shots.filter((s) => s.project_id === p.id);
    return {
      ...p,
      episode_count: db.episodes.filter((e) => e.project_id === p.id).length,
      shot_count: shots.length,
      approved_count: shots.filter((s) => s.status === "approved").length,
      generated_count: db.generations.filter(
        (g) => shots.some((s) => s.id === g.shot_id) && g.type === "image" && g.status === "completed"
      ).length,
    };
  });
  return Response.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getSessionForApi();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  const db = await load(session.userId);
  const p = {
    id: randomUUID(),
    name: name.trim(),
    style_guide: null,
    style_guide_filename: null,
    storyboard_filename: null,
    status: "active",
    created_at: new Date().toISOString(),
    user_id: session.userId,
  };
  db.projects.push(p);
  await save(db, session.userId);
  return Response.json(p, { status: 201 });
}
