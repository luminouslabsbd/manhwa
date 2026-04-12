"use client";
import useSWR from "swr";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const fetcher = (u: string) => fetch(u).then(r => r.json());

type Presets = { art_styles: string[]; environments: string[]; lighting: string[]; color_palettes: string[]; camera_angles: string[] };
type PC = { provider: string; model: string };
type Settings = {
  content_provider: PC; image_provider: PC; video_provider: PC;
  openai_api_key: string; anthropic_api_key: string; ollama_host: string; comfyui_host: string;
  mode: string; art_style: string; quality_tags: string; negative_prompt: string;
  environment_preset: string; lighting_preset: string; camera_presets: string[];
  color_palette: string; custom_prefix: string; custom_suffix: string; video_prompt_template: string;
};
const CLAUDE_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022"];
const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

type PromptTemplate = { id: string; project_id: string; name: string; formula: string; is_default: boolean; created_at: string };
type TmplForm = { id?: string; name: string; formula: string; is_default: boolean };

const TVARS = [
  { key: "char",        label: "All Chars",   hint: "All characters — name + appearance combined",    color: "#60a5fa" },
  { key: "char_name",   label: "Char Names",  hint: "All character names only",                       color: "#93c5fd" },
  { key: "char1",       label: "Char 1",      hint: "1st selected character — name + appearance",     color: "#34d399" },
  { key: "char2",       label: "Char 2",      hint: "2nd selected character — name + appearance",     color: "#f472b6" },
  { key: "char1_name",  label: "Char 1 Name", hint: "First character name only",                      color: "#6ee7b7" },
  { key: "char2_name",  label: "Char 2 Name", hint: "Second character name only",                     color: "#fbcfe8" },
  { key: "shot",        label: "Shot Desc",   hint: "Action / scene description",                     color: "#4ade80" },
  { key: "camera",      label: "Camera",      hint: "Camera angle",                                   color: "#f59e0b" },
  { key: "env",         label: "Environment", hint: "Resolved env description",                       color: "#2dd4bf" },
  { key: "lighting",    label: "Lighting",    hint: "Resolved lighting desc",                         color: "#fb923c" },
  { key: "style",       label: "Style Pack",  hint: "Full manhwa/anime style",                        color: "#a78bfa" },
  { key: "interaction", label: "Interaction", hint: "Interaction type spatial hint",                  color: "#e879f9" },
];

const VAR_COLOR: Record<string, string> = Object.fromEntries(TVARS.map(v => [v.key, v.color]));

function renderFormula(formula: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = /\[([a-z_]+)\]/g;
  while ((m = re.exec(formula)) !== null) {
    if (m.index > last) parts.push(<span key={last} style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 11 }}>{formula.slice(last, m.index)}</span>);
    const col = VAR_COLOR[m[1]] ?? "#a78bfa";
    parts.push(<span key={m.index} title={TVARS.find(v => v.key === m![1])?.hint ?? m[1]} style={{ color: col, background: col + "18", borderRadius: 3, padding: "0 4px", fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>[{m[1]}]</span>);
    last = m.index + m[0].length;
  }
  if (last < formula.length) parts.push(<span key={last} style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 11 }}>{formula.slice(last)}</span>);
  return parts;
}


export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: settings, mutate } = useSWR<Settings>(`/api/projects/${id}/prompt-settings`, fetcher);
  const { data: presets } = useSWR<Presets>("/api/presets", fetcher);
  const { data: modelsData } = useSWR<{ models: string[]; checkpoints: string[]; unets: string[]; loras: string[] }>("/api/models", fetcher);
  const { data: projectData, mutate: mutateProject } = useSWR(`/api/projects/${id}`, fetcher);
  const { data: ollamaData } = useSWR<{ models: string[]; error?: string }>(`/api/ollama-models?projectId=${id}`, fetcher, { refreshInterval: 30000 });
  const [pipelineModel, setPipelineModel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Settings | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; response?: string; error?: string; elapsed_ms?: number; provider?: string; model?: string } | null>(null);

  // Prompt Templates
  const { data: templatesRaw, mutate: mutateTemplates } = useSWR<PromptTemplate[]>(`/api/projects/${id}/prompt-templates`, fetcher);
  const templates = templatesRaw ?? [];
  const [tmplEditing, setTmplEditing] = useState<TmplForm | null>(null);
  const [tmplSaving, setTmplSaving] = useState(false);
  const formulaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { if (settings && !form) setForm(settings); }, [settings, form]);
  useEffect(() => { if (projectData?.pipeline_model) setPipelineModel(projectData.pipeline_model); }, [projectData]);

  async function saveSettings() {
    if (!form) return;
    setSaving(true);
    await fetch(`/api/projects/${id}/prompt-settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    mutate(); setSaving(false);
  }

function insertVar(key: string) {
    const ta = formulaRef.current;
    if (!ta || !tmplEditing) return;
    const start = ta.selectionStart ?? (tmplEditing.formula?.length ?? 0);
    const end = ta.selectionEnd ?? start;
    const newF = (tmplEditing.formula ?? "").slice(0, start) + `[${key}]` + (tmplEditing.formula ?? "").slice(end);
    setTmplEditing(e => e ? { ...e, formula: newF } : e);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + key.length + 2, start + key.length + 2); }, 0);
  }

  async function saveTemplate() {
    if (!tmplEditing) return;
    setTmplSaving(true);
    try {
      if (tmplEditing.id) {
        await fetch(`/api/prompt-templates/${tmplEditing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tmplEditing.name, formula: tmplEditing.formula, is_default: tmplEditing.is_default }) });
      } else {
        await fetch(`/api/projects/${id}/prompt-templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tmplEditing.name, formula: tmplEditing.formula, is_default: tmplEditing.is_default }) });
      }
      await mutateTemplates();
      setTmplEditing(null);
    } catch { /* ignore */ }
    setTmplSaving(false);
  }

  async function deleteTemplate(tid: string) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/prompt-templates/${tid}`, { method: "DELETE" });
    await mutateTemplates();
  }

  async function testLLM() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: id }) });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    }
    setTesting(false);
  }

const S: React.CSSProperties = { background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: "100%" };

  if (!form) return <div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /></div>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "10px 24px", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/projects" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 800 }}>◈</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${id}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>Project</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ fontWeight: 700 }}>⚙️ Settings</span>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px" }}>
        {/* ── GPU Environment ── */}
        {/* ── Image Model Selector ── */}
        <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--border)", padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>🎨 Default Image Model</h3>
            {pipelineModel && (
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>
                ✓ {pipelineModel.replace(/\.(safetensors|ckpt|pt)$/i, "")}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, margin: "4px 0 14px" }}>
            Project-wide default. Overridden by character or per-shot model. SDXL and FLUX workflows are detected automatically.
          </p>

          {(!modelsData) && <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span>}
          {modelsData && !modelsData.checkpoints?.length && !modelsData.unets?.length && (
            <span style={{ fontSize: 12, color: "#f87171" }}>No models found — is ComfyUI running?</span>
          )}

          {/* All models as a scrollable list */}
          {((modelsData?.checkpoints?.length ?? 0) + (modelsData?.unets?.length ?? 0)) > 0 && (() => {
            const saveModel = async (m: string) => {
              setPipelineModel(m);
              await fetch(`/api/projects/${id}/base-image`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipeline_model: m }) });
              mutateProject();
            };
            const allModelsList = [
              ...(modelsData?.checkpoints ?? []).map(m => ({ m, flux: false })),
              ...(modelsData?.unets ?? []).map(m => ({ m, flux: true })),
            ];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
                {allModelsList.map(({ m, flux }) => {
                  const selected = pipelineModel === m;
                  return (
                    <button key={m} onClick={() => saveModel(m)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                      borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
                      border: selected ? `2px solid ${flux ? "#8b5cf6" : "var(--accent)"}` : "1px solid var(--border)",
                      background: selected ? (flux ? "rgba(139,92,246,.12)" : "rgba(59,130,246,.12)") : "var(--bg)",
                      color: "var(--text)",
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                        background: flux ? "rgba(139,92,246,.2)" : "rgba(255,255,255,.07)",
                        color: flux ? "#a78bfa" : "var(--muted)" }}>
                        {flux ? "FLUX" : "SDXL"}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: selected ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {m.replace(/\.(safetensors|ckpt|pt)$/i, "")}
                      </span>
                      {selected && <span style={{ fontSize: 12, color: flux ? "#a78bfa" : "var(--accent)", flexShrink: 0 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* LoRAs */}
          {(modelsData?.loras ?? []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Available LoRAs</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(modelsData?.loras ?? []).map((l: string) => (
                  <span key={l} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--muted)" }}>
                    {l.replace(/\.(safetensors|ckpt|pt)$/i, "")}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>LoRAs can be applied per-shot in the shot editor.</div>
            </div>
          )}
        </div>

        {/* ── AI Providers (per task) ── */}
        <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--border)", padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>🤖 AI Providers</h3>
          {([
            { key: "content_provider" as const, label: "📝 Content", desc: "Story generation, prompt suggestions" },
            { key: "image_provider" as const, label: "🎨 Image", desc: "Image prompt refinement" },
            { key: "video_provider" as const, label: "🎬 Video", desc: "Video prompt refinement" },
          ]).map(({ key, label, desc }) => {
            const pc = form[key] || { provider: "ollama", model: "" };
            const setPC = (updates: Partial<PC>) => setForm({ ...form, [key]: { ...pc, ...updates } });
            const ollamaModels = ollamaData?.models ?? [];
            const modelsForProvider: string[] = pc.provider === "ollama" ? ollamaModels : pc.provider === "claude" ? CLAUDE_MODELS : OPENAI_MODELS;
            const ollamaOk = ollamaModels.length > 0;
            return (
              <div key={key} style={{ marginBottom: 16, padding: 12, background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>— {desc}</span></div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  {(["ollama", "claude", "openai"] as const).map(p => (
                    <button key={p} onClick={() => setPC({ provider: p, model: p === "ollama" ? (ollamaModels[0] ?? "") : p === "claude" ? CLAUDE_MODELS[0] : OPENAI_MODELS[0] })}
                      style={{
                        padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        border: pc.provider === p ? "2px solid var(--accent)" : "1px solid var(--border)",
                        background: pc.provider === p ? "var(--accent)" : "transparent",
                        color: pc.provider === p ? "#fff" : "var(--text)", fontWeight: pc.provider === p ? 700 : 400,
                      }}>
                      {p === "ollama" ? "🦙 Ollama" : p === "claude" ? "🟣 Claude" : "🟢 OpenAI"}
                    </button>
                  ))}
                  {pc.provider === "ollama" && !ollamaOk && (
                    <span style={{ fontSize: 10, color: "#f59e0b" }}>⚠ Ollama unreachable</span>
                  )}
                </div>
                {pc.provider === "ollama" && ollamaOk ? (
                  <select value={pc.model} onChange={e => setPC({ model: e.target.value })} style={{ ...S, maxWidth: 320 }}>
                    {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : pc.provider === "ollama" ? (
                  <input value={pc.model} onChange={e => setPC({ model: e.target.value })} placeholder="e.g. qwen2.5:7b" style={{ ...S, maxWidth: 320 }} />
                ) : (
                  <select value={pc.model} onChange={e => setPC({ model: e.target.value })} style={{ ...S, maxWidth: 320 }}>
                    {modelsForProvider.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          {/* Shared keys */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Ollama Host <span style={{ fontWeight: 400, color: "var(--muted)" }}>(blank = auto)</span>
              <input value={form.ollama_host} onChange={e => setForm({ ...form, ollama_host: e.target.value })} placeholder="auto-detected" style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>ComfyUI Host <span style={{ fontWeight: 400, color: "var(--muted)" }}>(blank = env default)</span>
              <input value={form.comfyui_host} onChange={e => setForm({ ...form, comfyui_host: e.target.value })} placeholder="auto-detected" style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Anthropic API Key
              <input type="password" value={form.anthropic_api_key} onChange={e => setForm({ ...form, anthropic_api_key: e.target.value })} placeholder="sk-ant-..." style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>OpenAI API Key
              <input type="password" value={form.openai_api_key} onChange={e => setForm({ ...form, openai_api_key: e.target.value })} placeholder="sk-..." style={S} />
            </label>
          </div>

          {/* Test LLM Connection */}
          <div style={{ marginTop: 16, padding: 12, background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button className="btn btn-sm" onClick={testLLM} disabled={testing}
                style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 12 }}>
                {testing ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Testing…</> : "🧪 Test Content LLM"}
              </button>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Sends a quick prompt to verify the content provider is reachable</span>
            </div>
            {testResult && (
              <div style={{
                marginTop: 10, padding: 10, borderRadius: 6, fontSize: 12,
                background: testResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${testResult.ok ? "#22c55e" : "#ef4444"}`,
                color: testResult.ok ? "#22c55e" : "#ef4444",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {testResult.ok ? "✅ Connection OK" : "❌ Connection Failed"}
                  {testResult.elapsed_ms && <span style={{ fontWeight: 400, marginLeft: 8 }}>({(testResult.elapsed_ms / 1000).toFixed(1)}s)</span>}
                  {testResult.provider && <span style={{ fontWeight: 400, marginLeft: 8, color: "var(--muted)" }}>[{testResult.provider}/{testResult.model}]</span>}
                </div>
                <div style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
                  {testResult.ok ? testResult.response : testResult.error}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Prompt Settings ── */}
        <div style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>🎨 Prompt Pattern Settings</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Mode
              <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} style={S}>
                <option value="document">📄 Document-based</option>
                <option value="environment">🌍 Environment preset</option>
                <option value="custom">✏️ Custom</option>
                <option value="random">🎲 Random</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Art Style
              <select value={form.art_style} onChange={e => setForm({ ...form, art_style: e.target.value })} style={S}>
                {presets?.art_styles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Environment
              <select value={form.environment_preset} onChange={e => setForm({ ...form, environment_preset: e.target.value })} style={S}>
                {presets?.environments.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Lighting
              <select value={form.lighting_preset} onChange={e => setForm({ ...form, lighting_preset: e.target.value })} style={S}>
                {presets?.lighting.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Color Palette
              <select value={form.color_palette} onChange={e => setForm({ ...form, color_palette: e.target.value })} style={S}>
                {presets?.color_palettes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Quality Tags
              <textarea value={form.quality_tags} onChange={e => setForm({ ...form, quality_tags: e.target.value })} rows={2} style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Negative Prompt
              <textarea value={form.negative_prompt} onChange={e => setForm({ ...form, negative_prompt: e.target.value })} rows={2} style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Custom Prefix (prepended to every prompt)
              <input value={form.custom_prefix} onChange={e => setForm({ ...form, custom_prefix: e.target.value })} style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Custom Suffix (appended to every prompt)
              <input value={form.custom_suffix} onChange={e => setForm({ ...form, custom_suffix: e.target.value })} style={S} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Video Prompt Template <span style={{ fontWeight: 400, color: "var(--muted)" }}>({"{prompt}"} = image prompt)</span>
              <textarea value={form.video_prompt_template} onChange={e => setForm({ ...form, video_prompt_template: e.target.value })} rows={2} style={S} />
            </label>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
              {saving ? <span className="spinner" /> : "💾"} Save Settings
            </button>
          </div>
        </div>

        {/* ── Prompt Templates ── */}
        <div id="templates" style={{ background: "var(--bg2)", borderRadius: 12, border: "1px solid var(--border)", padding: 20, marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>📋 Image Prompt Templates</h3>
            <button onClick={() => setTmplEditing({ name: "", formula: "[char], [shot], [camera], [env], [style], [lighting]", is_default: templates.length === 0 })}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(96,165,250,.4)", background: "rgba(96,165,250,.08)", color: "#60a5fa", cursor: "pointer", fontWeight: 700 }}>
              + New Template
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 16px" }}>
            Reusable prompt formulas with dynamic references. Select a template per-shot in the shot editor.
          </p>

          {/* Editor form */}
          {tmplEditing && (
            <div style={{ marginBottom: 20, padding: 16, background: "rgba(96,165,250,.05)", border: "1px solid rgba(96,165,250,.25)", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 12 }}>{tmplEditing.id ? "Edit Template" : "New Template"}</div>

              {/* Variable chips */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 700, letterSpacing: "0.5px" }}>CLICK TO INSERT VARIABLE</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TVARS.map(v => (
                    <button key={v.key} onClick={() => insertVar(v.key)} title={v.hint}
                      style={{ fontSize: 11, padding: "3px 9px", borderRadius: 5, border: `1px solid ${v.color}50`, background: `${v.color}15`, color: v.color, cursor: "pointer", fontWeight: 700, fontFamily: "monospace" }}>
                      [{v.key}]
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Name
                  <input value={tmplEditing.name} onChange={e => setTmplEditing(t => t ? { ...t, name: e.target.value } : t)} placeholder="e.g. Default Manhwa" style={{ ...S, marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginTop: 20 }}>
                  <input type="checkbox" checked={tmplEditing.is_default} onChange={e => setTmplEditing(t => t ? { ...t, is_default: e.target.checked } : t)} style={{ accentColor: "#4ade80" }} />
                  Set as default
                </label>
              </div>

              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 10 }}>Formula
                <textarea ref={formulaRef} value={tmplEditing.formula} onChange={e => setTmplEditing(t => t ? { ...t, formula: e.target.value } : t)}
                  rows={2} placeholder="[char], [shot], [camera], [env], [style], [lighting]"
                  style={{ ...S, marginTop: 4, fontFamily: "monospace", resize: "vertical" }} />
              </label>

              {/* Live preview */}
              {tmplEditing.formula && (
                <div style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(0,0,0,.2)", borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>PREVIEW</div>
                  <div style={{ lineHeight: 1.6 }}>{renderFormula(tmplEditing.formula)}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setTmplEditing(null)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>Cancel</button>
                <button onClick={saveTemplate} disabled={tmplSaving || !tmplEditing.name.trim() || !tmplEditing.formula.trim()}
                  style={{ fontSize: 12, padding: "5px 14px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {tmplSaving ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !tmplEditing ? (
            <div style={{ padding: "28px 0", textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>No templates yet.</div>
              <button onClick={() => setTmplEditing({ name: "Default", formula: "[char], [shot], [camera], [env], [style], [lighting]", is_default: true })}
                style={{ fontSize: 12, padding: "6px 16px", borderRadius: 7, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.1)", color: "#a78bfa", cursor: "pointer", fontWeight: 700 }}>
                ✦ Create Default Template
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.map(t => (
                <div key={t.id} style={{ padding: "12px 14px", borderRadius: 9, background: "var(--bg)", border: `1px solid ${t.is_default ? "rgba(34,197,94,.4)" : "var(--border)"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                    {t.is_default && <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(34,197,94,.15)", color: "#4ade80", borderRadius: 4, fontWeight: 700 }}>DEFAULT</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={() => setTmplEditing({ id: t.id, name: t.name, formula: t.formula, is_default: t.is_default })}
                        style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>Edit</button>
                      <button onClick={() => deleteTemplate(t.id)}
                        style={{ fontSize: 11, padding: "2px 10px", borderRadius: 4, border: "1px solid rgba(239,68,68,.3)", background: "transparent", color: "#f87171", cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                  <div style={{ lineHeight: 1.7 }}>{renderFormula(t.formula)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Variable reference */}
          <div style={{ marginTop: 20, padding: 14, background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 8, letterSpacing: "0.5px" }}>AVAILABLE VARIABLES</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
              {TVARS.map(v => (
                <div key={v.key} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: v.color, fontWeight: 700, minWidth: 88 }}>[{v.key}]</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{v.hint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
