import { load } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  const episodes = db.episodes.filter((e) => e.project_id === id).sort((a, b) => a.number - b.number);
  const manifest = episodes.map((ep) => {
    const shots = db.shots.filter((s) => s.episode_id === ep.id).sort((a, b) => a.shot_number - b.shot_number);
    return {
      episode: ep.number, title: ep.title,
      shots: shots.map((s) => {
        const imgGen = s.approved_image_id ? db.generations.find((g) => g.id === s.approved_image_id) : null;
        const vidGen = s.approved_video_id ? db.generations.find((g) => g.id === s.approved_video_id) : null;
        return { shot: s.shot_number, status: s.status, prompt: s.full_prompt, image: imgGen?.image_path ?? null, video: vidGen?.video_path ?? null };
      }),
    };
  });
  return Response.json(manifest);
}
