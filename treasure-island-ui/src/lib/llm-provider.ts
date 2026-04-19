/**
 * Unified LLM provider – routes to Ollama, Claude, or OpenAI based on PromptSettings.
 * Supports separate provider configs per task: content, image, video.
 */
import { PromptSettings, ProviderConfig, LLMProvider } from "@/lib/db";
import { getPodConfig } from "@/lib/pod-config";

// ─── Types ───
export type Message = { role: "system" | "user" | "assistant"; content: string };
export type LLMConfig = { provider: LLMProvider; model: string; apiKey: string; host: string };
export type TaskType = "content" | "image" | "video";

// ─── Resolve config from project settings + task type ───
export function resolveConfig(settings?: PromptSettings | null, task: TaskType = "content"): LLMConfig {
  // Pick the provider config for this task
  let pc: ProviderConfig | undefined;
  if (settings) {
    if (task === "content") pc = settings.content_provider;
    else if (task === "image") pc = settings.image_provider;
    else if (task === "video") pc = settings.video_provider;
  }
  const provider = pc?.provider || (process.env.ANTHROPIC_API_KEY ? "claude" : "ollama");
  const model = pc?.model;

  // Ollama host priority: admin pod-config (set in /admin/pods) → per-project
  // PromptSettings → env var → localhost fallback. The admin-level value wins
  // because that's the canonical place to point at a running RunPod instance.
  const adminOllamaHost = (() => {
    try { return getPodConfig().ollamaHost?.replace(/\/$/, "") || ""; }
    catch { return ""; }
  })();

  const defaults: Record<LLMProvider, { model: string; key: string; host: string }> = {
    ollama: { model: process.env.OLLAMA_MODEL || "qwen2.5:7b", key: "", host: adminOllamaHost || settings?.ollama_host || process.env.OLLAMA_HOST || inferOllamaHost() },
    claude: { model: "claude-sonnet-4-20250514", key: settings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "", host: "https://api.anthropic.com" },
    openai: { model: "gpt-4o", key: settings?.openai_api_key || process.env.OPENAI_API_KEY || "", host: "https://api.openai.com" },
  };
  const d = defaults[provider];
  return {
    provider,
    model: model || d.model,
    apiKey: d.key,
    host: d.host,
  };
}

function inferOllamaHost(): string {
  if (process.env.OLLAMA_HOST) return process.env.OLLAMA_HOST.replace(/\/$/, "");
  return "http://localhost:11434";
}

// ─── Chat options (optional per-call overrides) ───
export type ChatOptions = {
  // Max tokens to generate. Maps to Ollama num_predict, Claude/OpenAI max_tokens.
  maxTokens?: number;
  // Ollama-only: KV-cache context window.
  contextSize?: number;
  // Sampling temperature (passed through where supported).
  temperature?: number;
};

// ─── Chat (plain text response) ───
export async function chat(messages: Message[], config: LLMConfig, opts?: ChatOptions): Promise<string> {
  switch (config.provider) {
    case "ollama": return ollamaChat(messages, config, opts);
    case "claude": return claudeChat(messages, config, opts);
    case "openai": return openaiChat(messages, config, opts);
  }
}

// ─── Ollama ───
async function ollamaChat(messages: Message[], config: LLMConfig, opts?: ChatOptions): Promise<string> {
  const options: Record<string, number> = {
    num_predict: opts?.maxTokens ?? 16384,
    num_ctx: opts?.contextSize ?? 32768,
  };
  if (typeof opts?.temperature === "number") options.temperature = opts.temperature;
  const res = await fetch(`${config.host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      options,
    }),
    signal: AbortSignal.timeout(600000), // 10 min timeout for large generations
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.message?.content || "";
}

// ─── Claude (Anthropic) ───
async function claudeChat(messages: Message[], config: LLMConfig, opts?: ChatOptions): Promise<string> {
  if (!config.apiKey) throw new Error("Anthropic API key not set");
  const systemMsg = messages.find(m => m.role === "system")?.content || "";
  const chatMsgs = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: opts?.maxTokens ?? 4096,
    system: systemMsg,
    messages: chatMsgs,
  };
  if (typeof opts?.temperature === "number") body.temperature = opts.temperature;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ─── OpenAI ───
async function openaiChat(messages: Message[], config: LLMConfig, opts?: ChatOptions): Promise<string> {
  if (!config.apiKey) throw new Error("OpenAI API key not set");
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: opts?.maxTokens ?? 4096,
  };
  if (typeof opts?.temperature === "number") body.temperature = opts.temperature;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ─── Model lists per provider ───
export const MODELS: Record<LLMProvider, string[]> = {
  ollama: ["qwen2.5:3b", "qwen2.5:7b", "llama3.1:8b", "mistral:7b", "gemma2:9b"],
  claude: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
};
