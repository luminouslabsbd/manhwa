"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import RegenModal, { type RegenOptions } from "@/components/RegenModal";

const fetcher = (u: string) => { const c = new AbortController(); setTimeout(() => c.abort(), 8000); return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null); };

type Gen = { id: string; type: string; model: string; image_path: string | null; created_at: string; status: string };
type Char = {
  id: string; name: string; description: string; appearance: string; role: string;
  reference_prompt: string; reference_image: string | null; latest_image: string | null;
  seed: number | null; status: string; pipeline_model?: string | null; generations?: Gen[];
};

function displayModel(m: string) { return m.replace(/\.(safetensors|ckpt|pt)$/i, ""); }

const NavArrow = ({ dir, onClick, disabled }: { dir: "left" | "right"; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: "rgba(0,0,0,.6)", border: "none", color: disabled ? "rgba(255,255,255,.15)" : "#fff",
      cursor: disabled ? "default" : "pointer", borderRadius: 8, padding: "10px 14px", fontSize: 22,
      fontWeight: 700, lineHeight: 1, transition: "background .1s, transform .1s",
    }}
    onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(233,69,96,.8)"; (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; } }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,.6)"; (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
  >{dir === "left" ? "‹" : "›"}</button>
);

// Fixed item height for the left strip (image + label + button)
const ITEM_H = 200; // px per card

export default function CharacterDetailPage() {
  const { id, charId } = useParams<{ id: string; charId: string }>();
  const router = useRouter();
  const [char, setChar] = useState<Char | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", appearance: "", role: "", reference_prompt: "" });
  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenModal, setRegenModal] = useState(false);
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const refresh = useCallback(async () => {
    const resp = await fetcher(`/api/characters/${charId}`);
    if (!resp) return null;
    const data: Char = { ...resp.character, generations: resp.generations ?? [] };
    const defaultModel = resp.defaultModel ?? resp.character.pipeline_model ?? "unknown";
    data.generations = data.generations?.map((g: Gen) => ({
      ...g,
      model: g.type?.startsWith("image:") ? g.type.slice("image:".length) : (g.model ?? defaultModel),
    }));
    setChar(data);
    const gens: Gen[] = data.generations ?? [];
    const completed = gens.filter((g: Gen) => g.image_path);
    if (completed.length && !selectedGenId) {
      const refGen = completed.find((g: Gen) => g.image_path === data.reference_image) ?? completed[completed.length - 1];
      setSelectedGenId(refGen.id);
    }
    return data;
  }, [charId, selectedGenId]);

  useEffect(() => {
    const isGenerating = char?.status === "generating";
    if (isGenerating && !pollTimer.current) {
      pollTimer.current = setInterval(async () => {
        try { const ac = new AbortController(); setTimeout(() => ac.abort(), 15000); await fetch("/api/poll", { signal: ac.signal }); } catch { /* ignore */ }
        const updated = await refresh();
        if (updated && updated.status !== "generating") {
          if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
        }
      }, 5000);
    } else if (!isGenerating && pollTimer.current) {
      clearInterval(pollTimer.current); pollTimer.current = null;
    }
    return () => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; } };
  }, [char, refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (char) setForm({ name: char.name, description: char.description, appearance: char.appearance, role: char.role, reference_prompt: char.reference_prompt });
  }, [char?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveEdit() {
    setSaving(true);
    await fetch(`/api/characters/${charId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setEditing(false);
    refresh();
  }

  async function deleteChar() {
    if (!confirm(`Delete ${char?.name}? This cannot be undone.`)) return;
    await fetch(`/api/characters/${charId}`, { method: "DELETE" });
    router.push(`/projects/${id}/characters`);
  }

  async function regenAll(opts?: RegenOptions) {
    setRegenModal(false);
    setRegenLoading(true);
    if (!opts || opts.models.length === 0) {
      // All models
      await fetch(`/api/characters/${charId}/generate-all-models`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearOld: opts?.clearOld ?? false }),
      });
    } else {
      // Specific models — queue one at a time
      for (const model of opts.models) {
        await fetch(`/api/characters/${charId}/generate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
      }
    }
    setRegenLoading(false);
    refresh();
  }

  async function regenModel(model: string) {
    await fetch(`/api/characters/${charId}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: (model === "default" || model === char?.pipeline_model) ? undefined : model }) });
    refresh();
  }

  async function setReference(imagePath: string) {
    await fetch(`/api/characters/${charId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference_image: imagePath }) });
    refresh();
  }

  async function deleteGen(genId: string) {
    if (!confirm("Delete this image?")) return;
    await fetch(`/api/generations/${genId}`, { method: "DELETE" });
    if (selectedGenId === genId) setSelectedGenId(null);
    refresh();
  }

  if (!char) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
    </div>
  );

  const charDefaultModel = char.pipeline_model ?? "unknown";
  const allGens: Gen[] = char.generations ?? [];
  const byModel = allGens.reduce((acc, g) => {
    const m = g.model ?? charDefaultModel;
    if (!acc[m] || g.created_at > acc[m].created_at) acc[m] = g;
    return acc;
  }, {} as Record<string, Gen>);
  const modelGens = Object.entries(byModel).sort(([a], [b]) => a.localeCompare(b));
  const completedGens = allGens.filter(g => g.image_path).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const navigableGens = modelGens.filter(([, g]) => g.image_path);
  const selectedNavIdx = navigableGens.findIndex(([, g]) => g.id === selectedGenId);

  function navTo(delta: number) {
    const next = navigableGens[selectedNavIdx + delta];
    if (!next) return;
    const nextId = next[1].id;
    setSelectedGenId(nextId);
    // Scroll the item into view in the left strip
    setTimeout(() => {
      itemRefs.current[nextId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  const selectedGen = selectedGenId ? allGens.find(g => g.id === selectedGenId) ?? null : null;
  const selectedImage = selectedGen?.image_path ?? null;
  const isReference = selectedImage === char.reference_image;
  const selectedModel = selectedGen ? (selectedGen.model ?? charDefaultModel) : null;
  const isGenerating = char.status === "generating";

  const inp = { width: "100%", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 10px", fontSize: 13 } as const;
  const lbl = { display: "block" as const, fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 700 };

  return (
    <div
      style={{ height: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      tabIndex={-1}
      onKeyDown={e => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === "ArrowDown") { e.preventDefault(); navTo(1); }
        if (e.key === "ArrowUp") { e.preventDefault(); navTo(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); navTo(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); navTo(-1); }
      }}
    >
      {/* Nav */}
      <nav style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <Link href="/projects" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 800, fontSize: 16 }}>◈</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${id}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>Project</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${id}/characters`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>Characters</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ fontWeight: 700 }}>{char.name}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(!editing)}>✏ Edit</button>
          <button className="btn btn-primary btn-sm" onClick={() => setRegenModal(true)} disabled={regenLoading}>
            {regenLoading ? <span className="spinner" /> : "⚡"} Regen All
          </button>
          <button className="btn btn-sm" style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6 }} onClick={deleteChar}>🗑 Delete</button>
          <button
            onClick={() => router.push(`/projects/${id}/characters`)}
            style={{ background: "rgba(255,255,255,.08)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "5px 14px", fontSize: 20, fontWeight: 300, cursor: "pointer", lineHeight: 1 }}
            title="Back to characters"
          >×</button>
        </div>
      </nav>

      {/* Edit form */}
      {editing && (
        <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "20px 24px" }}>
          <div style={{ maxWidth: 900, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>NAME</label><input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={lbl}>ROLE</label><input style={inp} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>DESCRIPTION</label><textarea style={{ ...inp, height: 48, resize: "vertical" as const }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>APPEARANCE</label><textarea style={{ ...inp, height: 72, resize: "vertical" as const }} value={form.appearance} onChange={e => setForm(f => ({ ...f, appearance: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>REFERENCE PROMPT</label><textarea style={{ ...inp, height: 56, resize: "vertical" as const, fontFamily: "monospace", fontSize: 12 }} value={form.reference_prompt} onChange={e => setForm(f => ({ ...f, reference_prompt: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? <span className="spinner" /> : "💾 Save"}</button>
          </div>
        </div>
      )}

      {/* Main 3-column layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: filmstrip (fixed-height rows) ── */}
        <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--bg2)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            Models ({modelGens.length}){isGenerating && <span style={{ marginLeft: 6, color: "#f59e0b" }}>⏳</span>}
            {navigableGens.length > 1 && <span style={{ marginLeft: 6, color: "var(--border)", fontWeight: 400 }}>↑↓</span>}
          </div>

          <div ref={listRef} className="panel-scroll" style={{ flex: 1, overflowY: "scroll" }}>
            {modelGens.map(([model, gen]) => {
              const isRunning = !gen.image_path && gen.status !== "failed";
              const isFailed = gen.status === "failed";
              const isSel = gen.id === selectedGenId;
              const isRef = gen.image_path === char.reference_image;
              const isClickable = !isRunning && !isFailed && !!gen.image_path;
              return (
                <div
                  key={gen.id}
                  ref={el => { itemRefs.current[gen.id] = el; }}
                  onClick={() => { if (isClickable) { setSelectedGenId(gen.id); } }}
                  style={{
                    position: "relative",
                    height: ITEM_H,
                    cursor: isClickable ? "pointer" : "default",
                    borderBottom: "1px solid var(--border)",
                    outline: isSel ? `2px solid var(--accent)` : "2px solid transparent",
                    outlineOffset: -2,
                    transition: "outline-color .1s",
                    userSelect: "none",
                    flexShrink: 0,
                    overflow: "hidden",
                    background: "var(--bg)",
                  }}
                >
                  {/* Full-bleed image */}
                  {isRunning ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, background: "var(--bg2)" }}>
                      <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
                      <span style={{ fontSize: 9, color: "#f59e0b" }}>Generating…</span>
                    </div>
                  ) : isFailed ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4, background: "var(--bg2)" }}>
                      <span style={{ fontSize: 24 }}>⚠️</span>
                      <span style={{ fontSize: 9, color: "#ef4444" }}>Failed</span>
                    </div>
                  ) : gen.image_path ? (
                    <img src={gen.image_path} alt={model} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : null}

                  {/* Model badge — top left, always visible */}
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0,
                    background: "linear-gradient(rgba(0,0,0,.75), transparent)",
                    padding: "5px 6px 10px",
                    pointerEvents: "none",
                  }}>
                    <div style={{
                      display: "inline-block", fontSize: 9, fontWeight: 800,
                      color: isFailed ? "#f87171" : isRunning ? "#f59e0b" : "#fff",
                      background: isFailed ? "rgba(239,68,68,.4)" : isRunning ? "rgba(245,158,11,.3)" : "rgba(96,165,250,.35)",
                      borderRadius: 3, padding: "2px 5px",
                      maxWidth: "100%", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                    }}>
                      {displayModel(model)}
                    </div>
                  </div>

                  {/* REF badge top-right */}
                  {isRef && (
                    <div style={{ position: "absolute", top: 5, right: 5, background: "#22c55e", color: "#fff", borderRadius: 3, padding: "2px 5px", fontSize: 8, fontWeight: 700 }}>REF</div>
                  )}

                  {/* Bottom overlay: regen button */}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    background: "linear-gradient(transparent, rgba(0,0,0,.85))",
                    padding: "18px 7px 6px",
                  }}>
                    <button
                      style={{ width: "100%", fontSize: 9, background: isFailed ? "#ef4444" : "rgba(255,255,255,.15)", color: "#fff", border: "none", borderRadius: 3, padding: "3px 0", cursor: "pointer", fontWeight: 600 }}
                      onClick={e => { e.stopPropagation(); regenModel(model); }}
                    >{isFailed ? "↺ Retry" : "🔄 Regen"}</button>
                  </div>
                </div>
              );
            })}
            {modelGens.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                No images yet.<br />
                <button className="btn btn-primary btn-xs" style={{ marginTop: 10 }} onClick={() => setRegenModal(true)}>⚡ Generate</button>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER: large image with prev/next arrows ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", background: "var(--bg)", overflowY: "auto", position: "relative", padding: "24px 32px" }}>

          {navigableGens.length > 1 && (
            <div style={{ position: "fixed", top: "50%", left: 210, transform: "translateY(-50%)", zIndex: 10 }}>
              <NavArrow dir="left" onClick={() => navTo(-1)} disabled={selectedNavIdx <= 0} />
            </div>
          )}
          {navigableGens.length > 1 && (
            <div style={{ position: "fixed", top: "50%", right: 290, transform: "translateY(-50%)", zIndex: 10 }}>
              <NavArrow dir="right" onClick={() => navTo(1)} disabled={selectedNavIdx >= navigableGens.length - 1} />
            </div>
          )}

          {isGenerating && !selectedImage && (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 60 }}>
              <span className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
              <div style={{ marginTop: 12, fontSize: 13 }}>Generating images...</div>
            </div>
          )}
          {selectedImage ? (
            <>
              <img src={selectedImage} alt={char.name} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,.5)" }} />
              {navigableGens.length > 1 && (
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                  {selectedNavIdx + 1} / {navigableGens.length}
                </div>
              )}
            </>
          ) : !isGenerating ? (
            <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 60, padding: 24 }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>👤</div>
              <div style={{ fontSize: 14 }}>No image selected</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setRegenModal(true)}>⚡ Generate All Models</button>
            </div>
          ) : null}
        </div>

        {/* ── RIGHT: info + actions ── */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid var(--border)", overflowY: "auto", background: "var(--bg2)", display: "flex", flexDirection: "column" }}>

          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{char.name}</div>
            {char.role && <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, marginBottom: 8 }}>{char.role}</div>}
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>{char.appearance || char.description}</div>
            {char.description && char.appearance && (
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>{char.description}</div>
            )}
          </div>

          {selectedGen && selectedImage && (
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedModel && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(233,69,96,.1)", borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
                  {displayModel(selectedModel)}
                </div>
              )}
              <button
                onClick={() => setReference(selectedImage)}
                style={{
                  width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 700, borderRadius: 9, cursor: "pointer",
                  background: isReference ? "#22c55e" : "rgba(34,197,94,.12)",
                  color: isReference ? "#fff" : "#22c55e",
                  border: isReference ? "2px solid #22c55e" : "2px solid rgba(34,197,94,.4)",
                }}
              >
                {isReference ? "✓ Reference Image" : "✓ Set as Reference"}
              </button>
              <button
                onClick={() => selectedModel && regenModel(selectedModel)}
                style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: 9, border: "2px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.08)", color: "#f59e0b", cursor: "pointer" }}
              >
                🔄 Regen This Model
              </button>
              <button
                onClick={() => deleteGen(selectedGen.id)}
                style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: 9, border: "2px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.08)", color: "#f87171", cursor: "pointer" }}
              >
                🗑 Delete Image
              </button>
            </div>
          )}

          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>GENERATE</div>
            <button className="btn btn-primary" style={{ width: "100%", fontSize: 12 }} onClick={() => setRegenModal(true)} disabled={regenLoading}>
              {regenLoading ? <span className="spinner" /> : "⚡"} All Models (new seed)
            </button>
          </div>

          {char.reference_prompt && (
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>PROMPT</div>
              <div style={{ fontSize: 10, color: "var(--text)", lineHeight: 1.5, fontFamily: "monospace", background: "var(--bg)", borderRadius: 6, padding: 8, maxHeight: 120, overflowY: "auto" }}>
                {char.reference_prompt}
              </div>
            </div>
          )}

          <div style={{ padding: "14px 16px", marginTop: "auto" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
              <div>Total images: <b>{completedGens.length}</b></div>
              <div>Models run: <b>{modelGens.length}</b></div>
              {char.seed != null && <div>Last seed: <b>{char.seed}</b></div>}
              <div style={{ marginTop: 4 }}>
                Status: <span style={{ fontWeight: 700, color: char.status === "done" ? "#22c55e" : char.status === "generating" ? "#f59e0b" : "var(--text)" }}>{char.status}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {regenModal && (
        <RegenModal
          title={`Generate — ${char.name}`}
          subtitle="Pick which models to run"
          onConfirm={regenAll}
          onClose={() => setRegenModal(false)}
        />
      )}
    </div>
  );
}
