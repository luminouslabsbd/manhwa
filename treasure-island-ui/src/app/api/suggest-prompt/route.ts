import { llmText } from "@/lib/llm";
import { load } from "@/lib/db";

export async function POST(req: Request) {
  const { niche, projectName, projectId } = await req.json();

  // Load project settings if projectId provided
  const db = await load();
  const settings = projectId ? db.prompt_settings.find((s) => s.project_id === projectId) : null;

  try {
    const text = await llmText(
      `Generate a compelling, unique story premise for a ${niche} manhwa/webtoon called "${projectName || "Untitled"}".

Write 3-5 sentences describing:
- The main character and their situation
- The central conflict or quest
- What makes it unique/exciting
- The world/setting

Be creative and specific. Just output the story premise text, nothing else.`,
      settings,
    );
    return Response.json({ prompt: text.trim() });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
