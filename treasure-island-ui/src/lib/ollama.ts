/**
 * Ollama client — talks to Ollama running on the RunPod pod.
 * Uses the OpenAI-compatible /api/chat endpoint.
 */

function getOllamaHost(): string {
  // Use explicit OLLAMA_HOST, or derive from COMFYUI_HOST + /ollama path
  if (process.env.OLLAMA_HOST) return process.env.OLLAMA_HOST;
  const comfyHost = process.env.COMFYUI_HOST || "http://localhost:8188";
  return `${comfyHost}/ollama`;
}

const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";

export async function ollamaChat(
  prompt: string,
  options?: { system?: string; temperature?: number }
): Promise<string> {
  const host = getOllamaHost();

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        ...(options?.system ? [{ role: "system", content: options.system }] : []),
        { role: "user", content: prompt },
      ],
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.8,
        num_predict: 2048,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.message?.content ?? "";
}

export async function ollamaChatJSON<T>(
  prompt: string,
  options?: { system?: string; temperature?: number }
): Promise<T> {
  const host = getOllamaHost();

  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        ...(options?.system ? [{ role: "system", content: options.system }] : []),
        { role: "user", content: prompt },
      ],
      stream: false,
      format: "json",
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: 8192,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.message?.content ?? "";

  try {
    return JSON.parse(text) as T;
  } catch {
    // Try extracting JSON from markdown
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]) as T;
    throw new Error(`Invalid JSON from Ollama: ${text.slice(0, 200)}`);
  }
}
