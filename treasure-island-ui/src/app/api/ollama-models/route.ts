import { load } from "@/lib/db";

function inferOllamaHost(ollamaHost?: string): string {
  if (ollamaHost) return ollamaHost.replace(/\/$/, "");
  if (process.env.OLLAMA_HOST) return process.env.OLLAMA_HOST.replace(/\/$/, "");
  return "http://localhost:11434";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");

  let ollamaHost: string | undefined;
  if (projectId) {
    try {
      const db = await load();
      const episode = db.episodes?.find(e => e.project_id === projectId);
      void episode; // unused, just getting project settings
      // get prompt settings for ollama_host
      const settings = (db as Record<string, unknown>).prompt_settings as Record<string, { ollama_host?: string }> | undefined;
      ollamaHost = settings?.[projectId]?.ollama_host ?? undefined;
    } catch { /* ignore */ }
  }

  const host = inferOllamaHost(ollamaHost);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    return Response.json({ models, host });
  } catch {
    return Response.json({ models: [], host, error: "Ollama unreachable" });
  }
}
