import { load } from "@/lib/db";

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
