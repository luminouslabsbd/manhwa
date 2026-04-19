"use client";
import { useState } from "react";

type Category = "video" | "image" | "tts" | "all";
type Model = "any" | "ltx2" | "wan2";

const CATEGORIES: { value: Category; label: string; hint: string; color: string }[] = [
  { value: "video", label: "🎬 Videos",      hint: "All video generations (both LTX-2 and Wan 2.1, unless filtered below)", color: "#a78bfa" },
  { value: "image", label: "🖼 Images",       hint: "All image generations + resets shot approvals",                         color: "#60a5fa" },
  { value: "tts",   label: "🎙 TTS",          hint: "All TTS audio generations + clears shot audio",                         color: "#34d399" },
  { value: "all",   label: "🗑 Everything",   hint: "Every image, video and TTS generation in this episode",                 color: "#ef4444" },
];

const MODELS: { value: Model; label: string; hint: string }[] = [
  { value: "any",  label: "Any model",          hint: "No model filter (applies to video category only)" },
  { value: "ltx2", label: "LTX-2 only",         hint: "Only video:ltx2 entries" },
  { value: "wan2", label: "Wan 2.1 only",       hint: "Only Wan 2.1 / fallback entries (video, video:t2v_fallback, video:i2v_fallback)" },
];

export default function BulkDeleteModal({
  episodeId,
  episodeLabel,
  onClose,
  onDeleted,
}: {
  episodeId: string;
  episodeLabel?: string;
  onClose: () => void;
  onDeleted: (deleted: number) => void;
}) {
  const [category, setCategory] = useState<Category>("video");
  const [model, setModel] = useState<Model>("any");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelApplicable = category === "video";

  async function confirm() {
    const catMeta = CATEGORIES.find(c => c.value === category)!;
    const msg = `Delete ${catMeta.label.replace(/^[^ ]+ /, "")}${
      modelApplicable && model !== "any" ? ` (${MODELS.find(m => m.value === model)!.label})` : ""
    }${episodeLabel ? ` from ${episodeLabel}` : ""}?\nThis cannot be undone.`;
    if (!window.confirm(msg)) return;

    setSubmitting(true); setError(null);
    const q = new URLSearchParams({ category, model: modelApplicable ? model : "any" });
    try {
      const res = await fetch(`/api/episodes/${episodeId}/generations?${q}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { deleted } = await res.json();
      onDeleted(deleted ?? 0);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "24px 26px", width: 480, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#ef4444" }}>🗑 Bulk Delete</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Remove generations in bulk across this episode{episodeLabel ? ` · ${episodeLabel}` : ""}.</div>
          </div>
          <button onClick={onClose} disabled={submitting} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, cursor: submitting ? "default" : "pointer", lineHeight: 1, marginTop: -2 }}>×</button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Category</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {CATEGORIES.map(c => {
            const selected = category === c.value;
            return (
              <label key={c.value} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8,
                border: `2px solid ${selected ? c.color : "var(--border)"}`,
                background: selected ? `${c.color}14` : "transparent",
                cursor: submitting ? "default" : "pointer",
              }}>
                <input type="radio" name="cat" value={c.value} checked={selected} disabled={submitting}
                  onChange={() => setCategory(c.value)} style={{ marginTop: 3, accentColor: c.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: selected ? c.color : "var(--text)" }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{c.hint}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ opacity: modelApplicable ? 1 : 0.4, transition: "opacity .15s" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Model filter {modelApplicable ? "" : "(only applies to Videos)"}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {MODELS.map(m => {
              const selected = model === m.value;
              return (
                <button key={m.value} onClick={() => modelApplicable && setModel(m.value)} disabled={!modelApplicable || submitting}
                  title={m.hint}
                  style={{
                    flex: 1, padding: "8px 6px", fontSize: 11, fontWeight: 700, borderRadius: 7,
                    background: selected ? "rgba(233,69,96,.1)" : "var(--bg3)",
                    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    color: selected ? "var(--accent)" : "var(--muted)", cursor: modelApplicable && !submitting ? "pointer" : "default",
                }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", fontSize: 12, color: "#fca5a5" }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={submitting} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button onClick={confirm} disabled={submitting} className="btn btn-danger" style={{ flex: 2, background: "#ef4444", color: "#fff", border: "none" }}>
            {submitting ? "Deleting…" : "🗑 Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
