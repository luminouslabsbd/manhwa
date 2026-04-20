"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import useSWR from "swr";
import { toast } from "@/lib/toast";

const fetcher = (u: string) => { const c = new AbortController(); setTimeout(() => c.abort(), 8000); return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null); };

type Shot = { id: string; shot_number: number; character: string | null; shot_description: string; environment: string; lighting: string; camera_angle: string; full_prompt: string; negative_prompt: string; seed: number | null; width: number; height: number; steps: number; status: string; approved_image_id: string | null; approved_video_id: string | null; latest_image: string | null; latest_video: string | null; story_line: string | null; dialogue: string | null; anchor: string | null; pipeline_model: string | null; project_id: string; prompt_template_id?: string | null; interaction_type?: string | null; };
type PromptTemplate = { id: string; name: string; formula: string; is_default: boolean; };

const INTERACTION_TYPES = [
  { value: "solo",           label: "Solo",              hint: "Single character focus" },
  { value: "dialogue",       label: "Dialogue",          hint: "Face-to-face conversation" },
  { value: "passing-object", label: "Passing Object",    hint: "Handing something between chars" },
  { value: "action",         label: "Action / Fight",    hint: "Physical movement or combat" },
  { value: "side-by-side",   label: "Side by Side",      hint: "Together in frame" },
  { value: "confrontation",  label: "Confrontation",     hint: "Tense standoff" },
  { value: "crowd",          label: "Crowd / Group",     hint: "Three or more characters" },
];

const INTERACTION_SPATIAL: Record<string, { left: string; right: string }> = {
  dialogue:         { left: "left side, facing right",                right: "right side, facing left" },
  "passing-object": { left: "left, extending arm, open hand forward", right: "right, reaching out to receive" },
  action:           { left: "left, attacking/lunging",                right: "right, reacting/defending" },
  "side-by-side":   { left: "left side",                              right: "right side" },
  confrontation:    { left: "left, tense aggressive posture",         right: "right, tense defensive posture" },
  crowd:            { left: "foreground left",                        right: "background or right side" },
  solo:             { left: "center frame",                           right: "" },
};

const TVAR_COLORS: Record<string, string> = { char: "#60a5fa", char_name: "#93c5fd", char1: "#34d399", char2: "#f472b6", char1_name: "#6ee7b7", char2_name: "#fbcfe8", shot: "#4ade80", camera: "#f59e0b", env: "#2dd4bf", lighting: "#fb923c", style: "#a78bfa", interaction: "#e879f9" };
type TFormulaSeg = { type: "text"; text: string } | { type: "var"; key: string };
function parseTFormula(formula: string): TFormulaSeg[] {
  const segs: TFormulaSeg[] = []; let rem = formula; const re = /\[([a-z_]+)\]/;
  while (rem.length > 0) { const m = re.exec(rem); if (!m) { segs.push({ type: "text", text: rem }); break; } if (m.index > 0) segs.push({ type: "text", text: rem.slice(0, m.index) }); segs.push({ type: "var", key: m[1] }); rem = rem.slice(m.index + m[0].length); }
  return segs;
}
type Char = { id: string; name: string; appearance: string; role: string; reference_image: string | null; latest_image: string | null; status: string; pipeline_model?: string | null; };
type AdjacentShot = { shot_number: number; full_prompt: string; environment: string; lighting: string; character: string | null; };
type FrameWithPrompt = { id: string; frame_number: number; description: string; prompt: string; needed: boolean; image_path: string | null; ai_suggested: boolean };
type PendingSuggestion = { frame_number: number; description: string; prompt: string; needed: boolean };

export default function ShotEditor({ shot, onClose, onSaved, onNavigate, characters, adjacentShots, episodeId }: {
  shot: Shot;
  onClose: () => void;
  onSaved: () => void;
  onNavigate?: (dir: "prev" | "next") => void;
  characters?: Char[];
  adjacentShots?: { prev: AdjacentShot | null; next: AdjacentShot | null };
  episodeId?: string;
}) {
  const [form, setForm] = useState({ ...shot });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ checkpoints: string[]; unets: string[] }>({ checkpoints: [], unets: [] });

  // Reset all form state when navigating to a different shot, then fetch fresh data
  useEffect(() => {
    setForm({ ...shot });
    setTab("prompts");
    setPendingSuggestions(null);
    setSavedFrames([]);
    // Fetch fresh shot data (the prop may be stale from the parent SWR cache).
    // The API returns { shot, generations } — unwrap to the shot object.
    fetch(`/api/shots/${shot.id}`).then(r => r.ok ? r.json() : null).then(d => {
      const fresh = d?.shot ?? d;
      if (fresh && typeof fresh === "object" && "id" in fresh) setForm(fresh);
    }).catch(() => {});
  }, [shot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: projectData } = useSWR(`/api/projects/${shot.project_id}`, fetcher);
  const { data: templatesData } = useSWR<PromptTemplate[]>(`/api/projects/${shot.project_id}/prompt-templates`, fetcher);
  const templates = templatesData ?? [];

  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(d => {
      setAvailableModels({ checkpoints: d.checkpoints ?? [], unets: d.unets ?? [] });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!onNavigate) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && adjacentShots?.prev) { e.preventDefault(); navigateTo("prev"); }
      if (e.key === "ArrowRight" && adjacentShots?.next) { e.preventDefault(); navigateTo("next"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNavigate, adjacentShots]);
  const [suggestingFrames, setSuggestingFrames] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[] | null>(null);
  const [frameSufficient, setFrameSufficient] = useState(false);
  const [savedFrames, setSavedFrames] = useState<FrameWithPrompt[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [expandedFrame, setExpandedFrame] = useState<string | null>(null);
  const dragIdx = useRef<number | null>(null);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<"prompts" | "settings" | "continuity">("prompts");
  const { mutate: mutateDetail } = useSWR(`/api/shots/${shot.id}`, fetcher);

  // Multi-character helpers
  const selectedCharNames = (form.character ?? "").split(",").map(s => s.trim()).filter(Boolean);
  function toggleChar(name: string) {
    const cur = selectedCharNames;
    const next = cur.includes(name) ? cur.filter(n => n !== name) : [...cur, name];
    set("character", next.join(", ") || null);
  }
  const matchedChars = (characters ?? []).filter(c => selectedCharNames.some(n => n.toLowerCase() === c.name.toLowerCase()));
  const matchedChar = matchedChars[0] ?? null; // kept for compat (continuity tab)

  function set(field: string, val: unknown) { setForm(f => ({ ...f, [field]: val })); }

  const loadFrames = useCallback(async () => {
    setLoadingFrames(true);
    const r = await fetch(`/api/shots/${shot.id}/frames`);
    if (r.ok) setSavedFrames(await r.json());
    setLoadingFrames(false);
  }, [shot.id]);

  useEffect(() => {
    if (tab === "prompts") loadFrames();
  }, [tab, loadFrames]);

  async function autoFixPrompt(): Promise<string | null> {
    if (!episodeId) return null;
    try {
      const r = await fetch(`/api/episodes/${episodeId}/regenerate-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shot_id: shot.id, use_llm: false, force: true }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.updated > 0) {
          // Fetch the updated prompt from the shot
          const sr = await fetch(`/api/shots/${shot.id}`);
          if (sr.ok) { const sd = await sr.json(); set("full_prompt", sd.full_prompt); return sd.full_prompt; }
        }
      }
    } catch { /* non-fatal */ }
    return null;
  }

  const selectedTemplate = templates.find(t => t.id === (form as Record<string, unknown>).prompt_template_id);

  function applyTemplate(tmplId: string | null) {
    set("prompt_template_id", tmplId);
    if (!tmplId) return;
    const tmpl = templates.find(t => t.id === tmplId);
    if (!tmpl) return;
    const charNames = (form.character ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const charBlocks = charNames.map(name => {
      const c = characters?.find(ch => ch.name.toLowerCase() === name.toLowerCase());
      return { name, block: c?.appearance ? `${name}, ${c.appearance}` : name };
    });
    const itype = (form as Record<string, unknown>).interaction_type as string | null ?? null;
    const spatial = itype ? INTERACTION_SPATIAL[itype] ?? null : null;
    const rendered = tmpl.formula.replace(/\[([a-z_]+)\]/g, (_, key: string) => {
      if (key === "char")       return charBlocks.map(b => b.block).join(", ");
      if (key === "char_name")  return charNames.join(", ");
      if (key === "char1")      return charBlocks[0] ? `${spatial?.left ? spatial.left + ", " : ""}${charBlocks[0].block}` : "";
      if (key === "char2")      return charBlocks[1] ? `${spatial?.right ? spatial.right + ", " : ""}${charBlocks[1].block}` : "";
      if (key === "char1_name") return charBlocks[0]?.name ?? "";
      if (key === "char2_name") return charBlocks[1]?.name ?? "";
      if (key === "shot")       return form.shot_description;
      if (key === "camera")     return form.camera_angle;
      if (key === "env")        return form.environment;
      if (key === "lighting")   return form.lighting;
      if (key === "interaction") return spatial ? `${spatial.left}${spatial.right ? ` / ${spatial.right}` : ""}` : (itype ?? "");
      if (key === "style")      return "manhwa style, detailed linework, semi-realistic characters, sharp facial features, dramatic lighting, high contrast shadows, cinematic composition";
      return `[${key}]`;
    }).replace(/,\s*,/g, ",").trim();
    set("full_prompt", rendered);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    // Only re-render prompt from template — never overwrite a custom (no-template) prompt
    if ((form as Record<string, unknown>).prompt_template_id) await autoFixPrompt();
    setSaving(false);
    onSaved();
  }

  async function saveQuiet() {
    await fetch(`/api/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if ((form as Record<string, unknown>).prompt_template_id) await autoFixPrompt();
  }

  async function navigateTo(dir: "prev" | "next") {
    if (!onNavigate) return;
    setSaving(true);
    await saveQuiet();
    setSaving(false);
    onNavigate(dir);
  }

  async function generateShot() {
    setGenerating(true);
    await fetch(`/api/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    // Re-render from template before generating, but never overwrite custom prompts
    if ((form as Record<string, unknown>).prompt_template_id) await autoFixPrompt();
    const res = await fetch(`/api/shots/${shot.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: form.pipeline_model || undefined,
        generateFrames: true,
      }),
    });
    const d = await res.json();
    if (!res.ok) toast(d.error || "Generation failed", "error");
    else if (d.mode === "frames") toast(`Queued ${d.queued} frame(s) for generation`, "success");
    else toast("Queued for generation", "success");
    setGenerating(false);
    onSaved();
  }

  async function handleAISuggestPrompt() {
    // If template mode, first switch to custom so the user sees the AI result
    if ((form as Record<string, unknown>).prompt_template_id) {
      set("prompt_template_id", null);
    }
    setRegenPrompt(true);
    toast("✨ AI is generating prompt…", "info");
    try {
      const body: Record<string, unknown> = {
        interaction_type: (form as Record<string, unknown>).interaction_type ?? null,
      };
      if (adjacentShots?.prev) body.prev_shot = adjacentShots.prev;
      if (adjacentShots?.next) body.next_shot = adjacentShots.next;
      // Save current character + interaction_type first so API reads latest values
      await fetch(`/api/shots/${shot.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ character: form.character, interaction_type: (form as Record<string, unknown>).interaction_type ?? null }) });
      const r = await fetch(`/api/shots/${shot.id}/regenerate-prompt`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        set("full_prompt", d.full_prompt);
        toast(d.is_multi_char ? "✨ Multi-character prompt generated with BREAK regions" : "✨ Prompt generated", "success");
      } else {
        const e = await r.json().catch(() => ({}));
        toast(e.error ?? "AI Suggest failed", "error");
      }
    } catch (e) {
      toast(`AI Suggest error: ${e instanceof Error ? e.message : e}`, "error");
    }
    setRegenPrompt(false);
  }

  function swapChars() {
    const names = selectedCharNames;
    if (names.length < 2) return;
    const swapped = [names[1], names[0], ...names.slice(2)];
    set("character", swapped.join(", "));
  }

  function moveCharUp(idx: number) {
    if (idx === 0) return;
    const names = [...selectedCharNames];
    [names[idx - 1], names[idx]] = [names[idx], names[idx - 1]];
    set("character", names.join(", "));
  }

  function moveCharDown(idx: number) {
    if (idx >= selectedCharNames.length - 1) return;
    const names = [...selectedCharNames];
    [names[idx], names[idx + 1]] = [names[idx + 1], names[idx]];
    set("character", names.join(", "));
  }

  async function handleRetryImage() {
    await fetch(`/api/shots/${shot.id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: Math.floor(Math.random() * 999999) }) });
    mutateDetail();
    onSaved();
  }

  async function handleRetryVideo() {
    const res = await fetch(`/api/shots/${shot.id}/generate-video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) toast(`Video error: ${d.error ?? res.statusText}`, "error");
    else if (d.skipped) toast("Already generating — wait for current render to finish", "warning");
    else if (d.queued === 0 && d.errors?.length) toast(`Video failed: ${d.errors[0]}`, "error");
    else if (d.queued > 0) toast("Video queued", "success");
    mutateDetail();
    onSaved();
  }

  async function handleSuggestFrames() {
    setSuggestingFrames(true);
    setFrameSufficient(false);
    setPendingSuggestions(null);
    const r = await fetch(`/api/shots/${shot.id}/frames/ai-suggest`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      if (d.sufficient || (d.suggestions ?? []).length === 0) {
        setFrameSufficient(true);
      } else {
        setPendingSuggestions(d.suggestions);
      }
    }
    setSuggestingFrames(false);
  }

  async function approveSuggestion(idx: number) {
    if (approvingIdx !== null) return;
    const s = pendingSuggestions![idx];
    setApprovingIdx(idx);
    try {
      const r = await fetch(`/api/shots/${shot.id}/frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: s.description, prompt: s.prompt, needed: s.needed, ai_suggested: true }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setPendingSuggestions(prev => prev!.filter((_, i) => i !== idx));
      await loadFrames();
    } catch (e) {
      toast(`Failed to add frame: ${e instanceof Error ? e.message : e}`, "error");
    }
    setApprovingIdx(null);
  }

  function dismissSuggestion(idx: number) {
    setPendingSuggestions(prev => prev!.filter((_, i) => i !== idx));
  }

  async function addFrame() {
    await fetch(`/api/shots/${shot.id}/frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "", prompt: form.full_prompt, needed: true }),
    });
    await loadFrames();
  }

  async function deleteFrame(frameId: string) {
    await fetch(`/api/frames/${frameId}`, { method: "DELETE" });
    if (expandedFrame === frameId) setExpandedFrame(null);
    await loadFrames();
  }

  async function moveFrame(frameId: string, direction: "up" | "down") {
    const idx = savedFrames.findIndex(f => f.id === frameId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === savedFrames.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const a = savedFrames[idx];
    const b = savedFrames[swapIdx];
    await Promise.all([
      fetch(`/api/frames/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame_number: b.frame_number }) }),
      fetch(`/api/frames/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame_number: a.frame_number }) }),
    ]);
    await loadFrames();
  }

  async function handleDrop(toIdx: number) {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === toIdx) return;
    dragIdx.current = null;
    const reordered = [...savedFrames];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Reassign frame_numbers 1..n optimistically
    const updated = reordered.map((f, i) => ({ ...f, frame_number: i + 1 }));
    setSavedFrames(updated);
    await Promise.all(updated.map(f =>
      fetch(`/api/frames/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame_number: f.frame_number }) })
    ));
  }

  async function clearAllFrames() {
    if (savedFrames.length === 0) return;
    await Promise.all(savedFrames.map(f => fetch(`/api/frames/${f.id}`, { method: "DELETE" })));
    setSavedFrames([]);
    setExpandedFrame(null);
  }

  async function updateFrameField(frameId: string, field: string, value: string | boolean) {
    setSavedFrames(prev => prev.map(f => f.id === frameId ? { ...f, [field]: value } : f));
    await fetch(`/api/frames/${frameId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
  }

  const inputStyle = { width: "100%", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 10px", fontSize: 13 };
  const labelStyle = { display: "block" as const, fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 700, letterSpacing: "0.5px" };
  const row = { marginBottom: 12 };
  const tabBtn = (t: typeof tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, border: "none", borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", background: "none", color: tab === t ? "var(--text)" : "var(--muted)", cursor: "pointer" }}>{label}</button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: "100%", maxWidth: 960, maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Shot S{String(shot.shot_number).padStart(2, "0")}</h2>
            <span className={`badge badge-${shot.status === "video_done" ? "done" : shot.status}`} style={{ fontSize: 10 }}>{shot.status}</span>
            {shot.character && <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>👤 {shot.character}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onNavigate && (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => navigateTo("prev")}
                  disabled={!adjacentShots?.prev || saving}
                  title={adjacentShots?.prev ? `← Shot S${String(adjacentShots.prev.shot_number).padStart(2, "0")} (Alt+←)` : "No previous shot"}
                  style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg2)", color: adjacentShots?.prev ? "var(--text)" : "var(--muted)", cursor: adjacentShots?.prev ? "pointer" : "not-allowed", opacity: adjacentShots?.prev ? 1 : 0.4 }}>
                  ◀ Prev
                </button>
                <button
                  onClick={() => navigateTo("next")}
                  disabled={!adjacentShots?.next || saving}
                  title={adjacentShots?.next ? `→ Shot S${String(adjacentShots.next.shot_number).padStart(2, "0")} (Alt+→)` : "No next shot"}
                  style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg2)", color: adjacentShots?.next ? "var(--text)" : "var(--muted)", cursor: adjacentShots?.next ? "pointer" : "not-allowed", opacity: adjacentShots?.next ? 1 : 0.4 }}>
                  {saving ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : "Next ▶"}
                </button>
              </div>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "8px 20px 0", flexShrink: 0 }}>
          {tabBtn("prompts", "📝 Prompts & Frames")}
          {tabBtn("settings", "⚙️ Settings")}
          {tabBtn("continuity", "🔗 Continuity")}
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 20px" }}>

          {/* ═══ SETTINGS TAB ═══ */}
          {tab === "settings" && (<>
            {(shot.story_line || shot.dialogue || shot.anchor) && (
              <div style={{ marginBottom: 14, padding: 12, background: "var(--bg2)", borderRadius: 8, borderLeft: "3px solid var(--accent)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 6, letterSpacing: "0.5px" }}>📖 ORIGINAL STORYBOARD</div>
                {shot.anchor && <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 4 }}><strong>Anchor:</strong> {shot.anchor}</div>}
                {shot.story_line && <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 4 }}><strong>Line:</strong> {shot.story_line}</div>}
                {shot.dialogue && <div style={{ fontSize: 12, color: "#f59e0b", fontStyle: "italic" }}><strong>Dialogue:</strong> &ldquo;{shot.dialogue}&rdquo;</div>}
              </div>
            )}

            {/* Character consistency warnings */}
            {matchedChars.filter(c => !c.latest_image && !c.reference_image && !c.appearance).map(c => (
              <div key={c.id} style={{ marginBottom: 8, padding: "8px 12px", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 7, fontSize: 11, color: "#f59e0b" }}>
                ⚠ <strong>{c.name}</strong> has no reference image and no appearance description. Generated images will look inconsistent.
              </div>
            ))}
            {matchedChars.filter(c => !c.latest_image && !c.reference_image && c.appearance).map(c => (
              <div key={c.id} style={{ marginBottom: 8, padding: "8px 12px", background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 7, fontSize: 11, color: "#60a5fa" }}>
                ℹ No reference image for <strong>{c.name}</strong> — appearance will be embedded in prompt.
              </div>
            ))}

            <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
              {matchedChars.filter(c => c.latest_image || c.reference_image).map(c => (
                <div key={c.id} style={{ flexShrink: 0 }}>
                  <div style={labelStyle}>REF ✓ {c.name}</div>
                  <div style={{ width: 100, height: 100, borderRadius: 8, overflow: "hidden", border: "2px solid var(--accent)", background: "var(--bg2)" }}>
                    <img src={(c.latest_image || c.reference_image)!} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                </div>
              ))}
              {shot.latest_image && (
                <div style={{ flexShrink: 0 }}>
                  <div style={labelStyle}>CURRENT IMAGE</div>
                  <div style={{ width: 180, height: 120, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg2)" }}>
                    <img src={shot.latest_image} alt="Current" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                </div>
              )}
              {shot.latest_video && (
                <div style={{ flexShrink: 0 }}>
                  <div style={labelStyle}>CURRENT VIDEO</div>
                  <div style={{ width: 180, height: 120, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg2)" }}>
                    <video src={shot.latest_video} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline loop autoPlay />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={row}>
                <label style={labelStyle}>ENVIRONMENT</label>
                <input style={inputStyle} value={form.environment} onChange={e => set("environment", e.target.value)} />
              </div>
              <div style={row}>
                <label style={labelStyle}>LIGHTING</label>
                <select style={inputStyle} value={form.lighting} onChange={e => set("lighting", e.target.value)}>
                  {["dark", "neutral", "dramatic", "natural", "intense"].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div style={row}>
                <label style={labelStyle}>CAMERA ANGLE</label>
                <select style={inputStyle} value={form.camera_angle} onChange={e => set("camera_angle", e.target.value)}>
                  {["close-up", "extreme close-up", "medium shot", "wide shot", "over-the-shoulder", "bird's eye", "low angle"].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* ── Model selector ── */}
            <div style={{ ...row, marginBottom: 12 }}>
              <label style={labelStyle}>IMAGE MODEL</label>
              <select style={inputStyle} value={form.pipeline_model ?? ""} onChange={e => set("pipeline_model", e.target.value || null)}>
                <option value="">
                  Auto ({
                    matchedChar?.pipeline_model
                      ? `character: ${matchedChar.pipeline_model.replace(/\.(safetensors|ckpt|pt)$/i, "")}`
                      : projectData?.pipeline_model
                        ? `project: ${projectData.pipeline_model.replace(/\.(safetensors|ckpt|pt)$/i, "")}`
                        : availableModels.checkpoints[0]
                          ? `first: ${availableModels.checkpoints[0].replace(/\.(safetensors|ckpt|pt)$/i, "")}`
                          : availableModels.unets[0]
                            ? `first: ${availableModels.unets[0].replace(/\.(safetensors|ckpt|pt)$/i, "")}`
                            : "no model"
                  })
                </option>
                {availableModels.checkpoints.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {availableModels.unets.map(m => (
                  <option key={m} value={m}>⚡ {m}</option>
                ))}
              </select>
            </div>

            {/* ── Generation params ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
              {([["SEED", "seed"], ["WIDTH", "width"], ["HEIGHT", "height"], ["STEPS", "steps"]] as const).map(([label, field]) => (
                <div key={field}>
                  <label style={labelStyle}>{label}</label>
                  <input style={inputStyle} type="number" value={(form as Record<string, unknown>)[field] as string ?? ""} onChange={e => set(field, Number(e.target.value))} />
                </div>
              ))}
            </div>

            {/* ── Negative prompt ── */}
            <div style={row}>
              <label style={labelStyle}>NEGATIVE PROMPT</label>
              <textarea style={{ ...inputStyle, height: 40, resize: "vertical" as const, fontSize: 12 }} value={form.negative_prompt} onChange={e => set("negative_prompt", e.target.value)} />
            </div>

          </>)}

          {/* ═══ PROMPTS & FRAMES TAB ═══ */}
          {tab === "prompts" && (<>

            {/* ── Template selector ── */}
            <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(167,139,250,.06)", border: "1px solid rgba(167,139,250,.2)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: selectedTemplate ? 8 : 0 }}>
                <label style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, letterSpacing: "0.5px", flexShrink: 0 }}>📋 TEMPLATE</label>
                <select
                  style={{ flex: 1, background: "rgba(0,0,0,.3)", border: "1px solid rgba(167,139,250,.3)", color: "var(--text)", borderRadius: 5, padding: "5px 8px", fontSize: 12 }}
                  value={(form as Record<string, unknown>).prompt_template_id as string ?? ""}
                  onChange={e => applyTemplate(e.target.value || null)}
                >
                  <option value="">Custom (manual prompt)</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}{t.is_default ? " ★" : ""}</option>
                  ))}
                </select>
                {selectedTemplate && (
                  <button onClick={() => applyTemplate(selectedTemplate.id)} title="Re-render prompt from template" style={{ fontSize: 10, padding: "4px 8px", borderRadius: 5, border: "1px solid rgba(167,139,250,.3)", background: "rgba(167,139,250,.1)", color: "#a78bfa", cursor: "pointer", flexShrink: 0 }}>↻ Re-render</button>
                )}
                <a href={`/projects/${shot.project_id}/settings`} target="_blank" rel="noreferrer" title="Manage templates in project settings" style={{ fontSize: 10, padding: "4px 8px", borderRadius: 5, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "var(--muted)", cursor: "pointer", flexShrink: 0, textDecoration: "none" }}>Manage</a>
              </div>

              {/* Formula display */}
              {selectedTemplate && (
                <div style={{ padding: "6px 8px", background: "rgba(0,0,0,.25)", borderRadius: 5, lineHeight: 1.6 }}>
                  <div style={{ fontSize: 9, color: "rgba(167,139,250,.6)", fontWeight: 700, marginBottom: 3 }}>FORMULA</div>
                  <div style={{ fontSize: 11 }}>
                    {parseTFormula(selectedTemplate.formula).map((seg, i) =>
                      seg.type === "text"
                        ? <span key={i} style={{ color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>{seg.text}</span>
                        : <span key={i} style={{ color: TVAR_COLORS[seg.key] ?? "#a78bfa", fontFamily: "monospace", fontWeight: 700, background: `${TVAR_COLORS[seg.key] ?? "#a78bfa"}18`, borderRadius: 3, padding: "0 3px" }}>
                            [{seg.key}]
                          </span>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state hint */}
              {templates.length === 0 && (
                <div style={{ fontSize: 10, color: "rgba(167,139,250,.5)", marginTop: selectedTemplate ? 0 : 4 }}>
                  No templates yet. <a href={`/projects/${shot.project_id}/settings`} target="_blank" rel="noreferrer" style={{ color: "#a78bfa", fontSize: 10, textDecoration: "underline" }}>Create one</a> in project settings.
                </div>
              )}
            </div>

            {/* ── Character picker ── */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>👤 CHARACTERS</label>
              {characters && characters.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {characters.map(c => {
                    const active = selectedCharNames.some(n => n.toLowerCase() === c.name.toLowerCase());
                    return (
                      <button key={c.id} onClick={() => toggleChar(c.name)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400, border: active ? "2px solid var(--accent)" : "1px solid var(--border)", background: active ? "rgba(59,130,246,.15)" : "var(--bg2)", color: active ? "var(--accent)" : "var(--text)", transition: "all .15s" }}>
                        {(c.latest_image || c.reference_image) && (
                          <img src={(c.latest_image || c.reference_image)!} alt={c.name} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }} />
                        )}
                        {c.name}{c.role ? <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}> ({c.role})</span> : null}
                        {active && <span style={{ fontSize: 11 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input style={inputStyle} value={form.character ?? ""} onChange={e => set("character", e.target.value || null)} placeholder="e.g. Jim, Billy Bones" />
              )}

              {/* ── Ordered char list: char1 / char2 with reorder controls ── */}
              {selectedCharNames.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.5px", marginBottom: 2 }}>ORDER (drag or use arrows to set char1 / char2)</div>
                  {selectedCharNames.map((name, idx) => {
                    const c = characters?.find(ch => ch.name.toLowerCase() === name.toLowerCase());
                    const colors = ["#34d399", "#f472b6", "#f59e0b", "#60a5fa"];
                    const col = colors[idx] ?? "var(--muted)";
                    const label = idx === 0 ? "char1" : idx === 1 ? "char2" : `char${idx + 1}`;
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--bg2)", border: `1px solid ${col}35` }}>
                        {(c?.latest_image || c?.reference_image) && (
                          <img src={(c.latest_image || c.reference_image)!} alt={name} style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", border: `2px solid ${col}`, flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${col}20`, color: col, fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>[{label}]</span>
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{name}</span>
                        {c?.role && <span style={{ fontSize: 10, color: "var(--muted)" }}>{c.role}</span>}
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                          <button onClick={() => moveCharUp(idx)} disabled={idx === 0} style={{ background: "none", border: "none", color: idx === 0 ? "rgba(255,255,255,.1)" : "var(--muted)", cursor: idx === 0 ? "default" : "pointer", fontSize: 10, padding: "0 4px", lineHeight: 1 }}>▲</button>
                          <button onClick={() => moveCharDown(idx)} disabled={idx === selectedCharNames.length - 1} style={{ background: "none", border: "none", color: idx === selectedCharNames.length - 1 ? "rgba(255,255,255,.1)" : "var(--muted)", cursor: idx === selectedCharNames.length - 1 ? "default" : "pointer", fontSize: 10, padding: "0 4px", lineHeight: 1 }}>▼</button>
                        </div>
                        {selectedCharNames.length === 2 && idx === 0 && (
                          <button onClick={swapChars} title="Swap char1 ↔ char2" style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", flexShrink: 0 }}>⇄</button>
                        )}
                        <button onClick={() => toggleChar(name)} style={{ background: "none", border: "none", color: "rgba(239,68,68,.6)", cursor: "pointer", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Interaction type (multi-char spatial control) ── */}
            {selectedCharNames.length >= 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>🎭 INTERACTION TYPE</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {INTERACTION_TYPES.map(it => {
                    const active = ((form as Record<string, unknown>).interaction_type as string | null) === it.value;
                    return (
                      <button key={it.value} onClick={() => set("interaction_type", active ? null : it.value)} title={it.hint}
                        style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, cursor: "pointer", fontWeight: active ? 700 : 400, border: active ? "2px solid #e879f9" : "1px solid var(--border)", background: active ? "rgba(232,121,249,.15)" : "var(--bg2)", color: active ? "#e879f9" : "var(--muted)", transition: "all .15s" }}>
                        {it.label}
                      </button>
                    );
                  })}
                </div>
                {((form as Record<string, unknown>).interaction_type as string | null) && selectedCharNames.length >= 2 && (() => {
                  const spatial = INTERACTION_SPATIAL[(form as Record<string, unknown>).interaction_type as string] ?? null;
                  if (!spatial) return null;
                  return (
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.25)", fontSize: 11 }}>
                        <span style={{ color: "#34d399", fontWeight: 700 }}>{selectedCharNames[0]}</span>
                        <div style={{ color: "var(--muted)", marginTop: 2 }}>{spatial.left}</div>
                      </div>
                      {spatial.right && (
                        <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(244,114,182,.08)", border: "1px solid rgba(244,114,182,.25)", fontSize: 11 }}>
                          <span style={{ color: "#f472b6", fontWeight: 700 }}>{selectedCharNames[1] ?? "char2"}</span>
                          <div style={{ color: "var(--muted)", marginTop: 2 }}>{spatial.right}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Story / Anchor / Dialogue ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={row}>
                <label style={labelStyle}>📖 STORY LINE</label>
                <input style={inputStyle} value={(form as Record<string, unknown>).story_line as string ?? ""} onChange={e => set("story_line", e.target.value || null)} placeholder="Original line from script" />
              </div>
              <div style={row}>
                <label style={labelStyle}>🎬 ANCHOR / ACTION</label>
                <input style={inputStyle} value={(form as Record<string, unknown>).anchor as string ?? ""} onChange={e => set("anchor", e.target.value || null)} placeholder="Key action or moment" />
              </div>
              <div style={row}>
                <label style={labelStyle}>💬 DIALOGUE</label>
                <input style={inputStyle} value={(form as Record<string, unknown>).dialogue as string ?? ""} onChange={e => set("dialogue", e.target.value || null)} placeholder="Character speech" />
              </div>
            </div>

            {/* ── Shot description ── */}
            <div style={row}>
              <label style={labelStyle}>SHOT DESCRIPTION</label>
              <textarea style={{ ...inputStyle, height: 56, resize: "vertical" as const }} value={form.shot_description} onChange={e => set("shot_description", e.target.value)} />
            </div>

            {/* ── Full prompt ── */}
            <div style={row}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ ...labelStyle, margin: 0 }}>{selectedTemplate ? "RENDERED PROMPT" : "FULL PROMPT"}</label>
                <button onClick={handleAISuggestPrompt} disabled={regenPrompt}
                  title={selectedTemplate ? "Switches to Custom mode and generates AI prompt" : selectedCharNames.length >= 2 ? "AI will generate BREAK-structured multi-char prompt" : "Generate prompt with AI using shot context + adjacent shots"}
                  style={{ fontSize: 10, padding: "3px 10px", background: regenPrompt ? "rgba(167,139,250,.08)" : "rgba(167,139,250,.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.4)", borderRadius: 5, cursor: regenPrompt ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  {regenPrompt
                    ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> Thinking…</>
                    : <>✨ AI Suggest{selectedTemplate ? " (→ Custom)" : ""}{selectedCharNames.length >= 2 ? " ✦ Multi" : ""}</>}
                </button>
              </div>
              <textarea style={{ ...inputStyle, height: 90, resize: "vertical" as const, fontFamily: "monospace", fontSize: 12 }} value={form.full_prompt} onChange={e => set("full_prompt", e.target.value)} />
              {selectedTemplate && <div style={{ fontSize: 10, color: "rgba(167,139,250,.6)", marginTop: 4 }}>Rendered from template — edit above to override, or use ✨ AI Suggest to switch to custom.</div>}
              {!selectedTemplate && <div style={{ fontSize: 10, color: "rgba(255,255,255,.25)", marginTop: 4 }}>Custom mode — edit freely or use ✨ AI Suggest for context-aware prompt{selectedCharNames.length >= 2 ? " with BREAK regions" : ""}.</div>}
              <button className="btn btn-xs" onClick={handleSuggestFrames} disabled={suggestingFrames}
                style={{ marginTop: 6, fontSize: 11, padding: "4px 10px", background: "rgba(96,165,250,.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,.3)", borderRadius: 5 }}>
                {suggestingFrames ? "⏳ Analyzing…" : "🤖 Suggest Frames"}
              </button>
              {frameSufficient && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 6, fontSize: 12, color: "#4ade80", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>✅ Prompt is sufficient — no extra frames needed</span>
                  <button onClick={() => setFrameSufficient(false)} style={{ background: "none", border: "none", color: "#4ade80", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                </div>
              )}
            </div>

            {/* ── AI Pending Suggestions ── */}
            {pendingSuggestions !== null && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(167,139,250,.06)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", display: "flex", alignItems: "center", gap: 8 }}>
                    🔮 AI Suggestions {pendingSuggestions.length > 0 ? `(${pendingSuggestions.length})` : "— all approved"}
                    {matchedChar && (matchedChar.latest_image || matchedChar.reference_image) && (
                      <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(34,197,94,.15)", color: "#4ade80", borderRadius: 4, fontWeight: 700 }}>✓ char ref used</span>
                    )}
                    {matchedChar && !matchedChar.latest_image && !matchedChar.reference_image && matchedChar.appearance && (
                      <span style={{ fontSize: 9, padding: "2px 6px", background: "rgba(96,165,250,.1)", color: "#60a5fa", borderRadius: 4, fontWeight: 700 }}>appearance embedded</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {pendingSuggestions.length > 1 && (
                      <button
                        onClick={async () => {
                          const all = [...pendingSuggestions];
                          setPendingSuggestions([]);
                          setApprovingIdx(-1);
                          try {
                            for (const s of all) {
                              await fetch(`/api/shots/${shot.id}/frames`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ description: s.description, prompt: s.prompt, needed: s.needed, ai_suggested: true }),
                              });
                            }
                            await loadFrames();
                          } catch (e) {
                            toast(`Failed to approve all: ${e instanceof Error ? e.message : e}`, "error");
                          }
                          setApprovingIdx(null);
                        }}
                        disabled={approvingIdx !== null}
                        style={{ fontSize: 10, padding: "2px 9px", fontWeight: 700, background: "rgba(34,197,94,.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,.3)", borderRadius: 4, cursor: "pointer" }}>
                        ✓ Approve All
                      </button>
                    )}
                    <button onClick={() => { setPendingSuggestions(null); setFrameSufficient(false); }}
                      style={{ fontSize: 10, padding: "2px 7px", background: "none", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
                      ✕ Close
                    </button>
                  </div>
                </div>
                {pendingSuggestions.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>All suggestions added.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pendingSuggestions.map((s, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: "rgba(255,255,255,.03)", borderRadius: 6, border: "1px solid rgba(167,139,250,.15)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: "#a78bfa", fontSize: 11, flexShrink: 0 }}>F{s.frame_number}</span>
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: s.needed ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.06)", color: s.needed ? "#4ade80" : "var(--muted)", fontWeight: 700 }}>
                            {s.needed ? "needed" : "optional"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, marginBottom: 3 }}>{s.description}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4, maxHeight: 34, overflow: "hidden" }}>{s.prompt}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0, paddingTop: 2 }}>
                        <button onClick={() => approveSuggestion(idx)} disabled={approvingIdx === idx}
                          style={{ padding: "3px 9px", fontSize: 11, fontWeight: 600, background: "rgba(34,197,94,.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,.3)", borderRadius: 4, cursor: "pointer" }}>
                          {approvingIdx === idx ? "…" : "Approve"}
                        </button>
                        <button onClick={() => dismissSuggestion(idx)}
                          style={{ padding: "3px 7px", fontSize: 11, background: "none", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Saved Frames ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa" }}>
                  🎞 Frames {loadingFrames ? "…" : `(${savedFrames.length})`}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {savedFrames.length > 0 && (
                    <button onClick={clearAllFrames}
                      style={{ fontSize: 10, padding: "2px 8px", background: "rgba(239,68,68,.1)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)", borderRadius: 4, cursor: "pointer" }}>
                      🗑 Clear All
                    </button>
                  )}
                  <button onClick={addFrame}
                    style={{ fontSize: 10, padding: "2px 8px", background: "rgba(96,165,250,.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,.3)", borderRadius: 4, cursor: "pointer" }}>
                    + Add Frame
                  </button>
                </div>
              </div>

              {!loadingFrames && savedFrames.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>
                  No frames yet. Use &quot;Suggest Frames&quot; for AI suggestions, or add manually.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {savedFrames.map((f, idx) => (
                  <div key={f.id}
                    draggable
                    onDragStart={() => { dragIdx.current = idx; }}
                    onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = "#60a5fa"; }}
                    onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(96,165,250,.15)"; }}
                    onDrop={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(96,165,250,.15)"; handleDrop(idx); }}
                    style={{ borderRadius: 6, background: "rgba(255,255,255,.03)", border: "1px solid rgba(96,165,250,.15)", overflow: "hidden", cursor: "grab", transition: "border-color .15s" }}>
                    <div style={{ padding: "7px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      {/* drag handle */}
                      <span style={{ color: "var(--muted)", fontSize: 13, cursor: "grab", flexShrink: 0, userSelect: "none" }}>⠿</span>
                      <button onClick={() => setExpandedFrame(expandedFrame === f.id ? null : f.id)}
                        style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, fontSize: 11, flexShrink: 0 }}>
                        {expandedFrame === f.id ? "▼" : "▶"}
                      </button>
                      <span style={{ fontWeight: 700, color: "#60a5fa", fontSize: 11, flexShrink: 0 }}>F{f.frame_number}</span>
                      <input
                        style={{ flex: 1, background: "transparent", border: "none", color: "var(--text)", fontSize: 12, outline: "none", minWidth: 0, cursor: "text" }}
                        value={f.description}
                        placeholder="Frame description…"
                        onChange={e => setSavedFrames(prev => prev.map(fr => fr.id === f.id ? { ...fr, description: e.target.value } : fr))}
                        onBlur={e => updateFrameField(f.id, "description", e.target.value)}
                      />
                      <button onClick={() => updateFrameField(f.id, "needed", !f.needed)}
                        style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: f.needed ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.06)", color: f.needed ? "#4ade80" : "var(--muted)", border: "none", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                        {f.needed ? "needed" : "optional"}
                      </button>
                      <button onClick={() => deleteFrame(f.id)}
                        style={{ background: "none", border: "none", color: "rgba(239,68,68,.6)", cursor: "pointer", padding: "0 2px", fontSize: 13 }}>✕</button>
                    </div>
                    {expandedFrame === f.id && (
                      <div style={{ padding: "8px 8px 8px 28px", borderTop: "1px solid rgba(96,165,250,.1)" }}>
                        <label style={{ ...labelStyle, marginBottom: 4 }}>Frame Prompt</label>
                        <textarea
                          style={{ ...inputStyle, height: 60, resize: "vertical" as const, fontSize: 11 }}
                          value={f.prompt}
                          placeholder="Frame-specific prompt…"
                          onChange={e => setSavedFrames(prev => prev.map(fr => fr.id === f.id ? { ...fr, prompt: e.target.value } : fr))}
                          onBlur={e => updateFrameField(f.id, "prompt", e.target.value)}
                        />
                        {f.image_path && (
                          <div style={{ marginTop: 6 }}>
                            <img src={f.image_path} alt={`Frame ${f.frame_number}`} style={{ height: 80, borderRadius: 4, border: "1px solid var(--border)" }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* ═══ CONTINUITY TAB ═══ */}
          {tab === "continuity" && (
            <div style={{ padding: 4 }}>
              {matchedChar ? (
                <div style={{ marginBottom: 14, padding: 12, background: "rgba(255,255,255,.03)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>👤 {matchedChar.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
                    <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Role:</span> {matchedChar.role || "—"}</div>
                    <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Appearance:</span> {matchedChar.appearance || "—"}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, padding: "10px 12px", background: "rgba(255,255,255,.02)", borderRadius: 8, border: "1px solid var(--border)" }}>No character selected</div>
              )}
              {adjacentShots?.prev || adjacentShots?.next ? (
                <>
                  {adjacentShots.prev && <ShotCompare label={`← Previous: Shot ${adjacentShots.prev.shot_number}`} other={adjacentShots.prev} current={shot} />}
                  {adjacentShots.next && <ShotCompare label={`→ Next: Shot ${adjacentShots.next.shot_number}`} other={adjacentShots.next} current={shot} />}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>No adjacent shots to compare</div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          {(shot.approved_image_id || shot.latest_video) && <button className="btn btn-sm" onClick={handleRetryVideo} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6 }}>🎬 Retry Video</button>}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-secondary btn-sm" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : "💾 Save"}</button>
          <button className="btn btn-primary btn-sm" onClick={generateShot} disabled={generating}>{generating ? <span className="spinner" /> : "⚡"} Generate</button>
        </div>
      </div>
    </div>
  );
}

/* ── Mini component: compare current shot prompt with adjacent shot ── */
function ShotCompare({ label, other, current }: { label: string; other: AdjacentShot; current: Shot }) {
  const keywords = ["wind", "rain", "storm", "fog", "night", "day", "dawn", "dusk", "sunset", "dark", "bright", "dim", "candle", "moon", "sun", "indoor", "outdoor"];
  const getKW = (text: string) => keywords.filter(k => text.toLowerCase().includes(k));
  const currentKW = getKW(current.full_prompt + " " + current.environment + " " + current.lighting);
  const otherKW = getKW(other.full_prompt + " " + other.environment + " " + other.lighting);
  const onlyCurrent = currentKW.filter(k => !otherKW.includes(k));
  const onlyOther = otherKW.filter(k => !currentKW.includes(k));
  const hasMismatch = onlyCurrent.length > 0 || onlyOther.length > 0;

  return (
    <div style={{ marginBottom: 10, padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8, borderLeft: hasMismatch ? "3px solid #f59e0b" : "3px solid #22c55e" }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{label} {other.character && `(${other.character})`}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4, marginBottom: 6, maxHeight: 40, overflow: "hidden" }}>{other.full_prompt.slice(0, 120)}…</div>
      {hasMismatch ? (
        <div style={{ fontSize: 10 }}>
          {onlyCurrent.length > 0 && <div style={{ color: "#f59e0b" }}>⚠️ This shot has <strong>{onlyCurrent.join(", ")}</strong> but Shot {other.shot_number} doesn&apos;t</div>}
          {onlyOther.length > 0 && <div style={{ color: "#f59e0b" }}>⚠️ Shot {other.shot_number} has <strong>{onlyOther.join(", ")}</strong> but this shot doesn&apos;t</div>}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: "#22c55e" }}>✅ Keywords consistent</div>
      )}
    </div>
  );
}
