"use client";
import { useState, useEffect } from "react";

export type RegenOptions = {
  models: string[];   // empty = all models (use generate-all-models endpoint)
  clearOld: boolean;
};

export default function RegenModal({
  title,
  subtitle,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onConfirm: (opts: RegenOptions) => void;
  onClose: () => void;
}) {
  const [allModels, setAllModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearOld, setClearOld] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/models")
      .then(r => r.json())
      .then(d => {
        const models: string[] = d.models ?? [];
        setAllModels(models);
        setSelected(new Set(models)); // pre-select all
      })
      .catch(() => setAllModels([]))
      .finally(() => setLoading(false));
  }, []);

  function toggle(m: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(allModels)); }
  function selectNone() { setSelected(new Set()); }

  const allSelected = allModels.length > 0 && selected.size === allModels.length;
  const noneSelected = selected.size === 0;

  function confirm() {
    // If all selected, pass empty array → caller uses generate-all-models endpoint
    const models = allSelected ? [] : [...selected];
    onConfirm({ models, clearOld });
  }

  function displayModel(m: string) { return m.replace(/\.(safetensors|ckpt|pt)$/i, ""); }
  function isFlux(m: string) { return /flux|unet/i.test(m); }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "26px 28px", width: 460, maxWidth: "92vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.6)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>↺ {title}</div>
            {subtitle && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 2px", marginTop: -2 }}>×</button>
        </div>

        {/* Clear old checkbox */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, cursor: "pointer", marginBottom: 18, flexShrink: 0 }}>
          <input type="checkbox" checked={clearOld} onChange={e => setClearOld(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#ef4444", cursor: "pointer", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>Clear all existing images first</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Deletes all generation records before re-generating</div>
          </div>
        </label>

        {/* Model list header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
            Models {loading ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, marginLeft: 6 }} /> : `(${selected.size} / ${allModels.length})`}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={selectAll} style={{ fontSize: 10, background: "none", border: "none", color: allSelected ? "var(--muted)" : "var(--accent)", cursor: allSelected ? "default" : "pointer", fontWeight: 700, padding: 0 }}>All</button>
            <span style={{ color: "var(--border)", fontSize: 10 }}>·</span>
            <button onClick={selectNone} style={{ fontSize: 10, background: "none", border: "none", color: noneSelected ? "var(--muted)" : "var(--text)", cursor: noneSelected ? "default" : "pointer", fontWeight: 700, padding: 0 }}>None</button>
          </div>
        </div>

        {/* Scrollable model checklist */}
        <div className="panel-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 12 }}>Loading models from ComfyUI…</div>
          ) : allModels.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 12 }}>No models found — is ComfyUI running?</div>
          ) : allModels.map(m => {
            const checked = selected.has(m);
            const flux = isFlux(m);
            return (
              <label key={m} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderRadius: 7, cursor: "pointer",
                background: checked ? (flux ? "rgba(139,92,246,.1)" : "rgba(233,69,96,.08)") : "var(--bg3)",
                border: `1px solid ${checked ? (flux ? "rgba(139,92,246,.35)" : "rgba(233,69,96,.3)") : "var(--border)"}`,
                transition: "all .1s",
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(m)}
                  style={{ width: 14, height: 14, accentColor: flux ? "#8b5cf6" : "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: checked ? (flux ? "#a78bfa" : "var(--accent)") : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayModel(m)}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: flux ? "#8b5cf6" : "var(--muted)", background: flux ? "rgba(139,92,246,.12)" : "rgba(255,255,255,.05)", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                  {flux ? "FLUX" : "SDXL"}
                </span>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button
            onClick={confirm}
            disabled={noneSelected}
            className="btn btn-primary"
            style={{ flex: 2, opacity: noneSelected ? .4 : 1 }}
          >
            ↺ Generate {selected.size > 0 ? `(${selected.size} model${selected.size !== 1 ? "s" : ""})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
