import { llmText } from "@/lib/llm";
import { load } from "@/lib/db";

export async function POST(req: Request) {
  const { projectId } = await req.json();

  const db = await load();
  const settings = projectId
    ? db.prompt_settings.find((s) => s.project_id === projectId) || null
    : null;

  const startMs = Date.now();
  try {
    const text = await llmText(
      "Say hello in one sentence. Be creative and brief.",
      settings,
      "content",
    );
    const elapsed = Date.now() - startMs;
    return Response.json({
      ok: true,
      response: text.trim(),
      elapsed_ms: elapsed,
      provider: settings?.content_provider?.provider || "ollama",
      model: settings?.content_provider?.model || "qwen2.5:3b",
    });
  } catch (e) {
    const elapsed = Date.now() - startMs;
    return Response.json(
      {
        ok: false,
        error: String(e),
        elapsed_ms: elapsed,
        provider: settings?.content_provider?.provider || "ollama",
        model: settings?.content_provider?.model || "qwen2.5:3b",
      },
      { status: 500 },
    );
  }
}
