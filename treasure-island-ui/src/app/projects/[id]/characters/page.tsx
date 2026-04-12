"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import BaseImagePanel from "@/components/BaseImagePanel";

const fetcher = (u: string) => { const c = new AbortController(); setTimeout(() => c.abort(), 6000); return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null); };

type Char = { id: string; name: string; description: string; appearance: string; role: string; reference_prompt: string; reference_image: string | null; latest_image: string | null; seed: number | null; status: string; generation_count: number };
type CharWithGenerations = Char & { generations?: { id: string; image_path: string | null; status: string }[] };

export default function CharactersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [chars, setChars] = useState<CharWithGenerations[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", appearance: "", role: "", reference_prompt: "" });
  const [saving, setSaving] = useState(false);
  const [genAllLoading, setGenAllLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetcher(`/api/projects/${id}/characters`);
    if (data) setChars(data);
    return data as Char[] | null;
  }, [id]);

  useEffect(() => {
    const hasGenerating = chars?.some(c => c.status === "generating");
    if (hasGenerating && !pollTimer.current) {
      pollTimer.current = setInterval(async () => {
        try { const ac = new AbortController(); setTimeout(() => ac.abort(), 15000); await fetch("/api/poll", { signal: ac.signal }); } catch { /* ignore */ }
        const updated = await refresh();
        if (updated && !updated.some((c: Char) => c.status === "generating")) {
          if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
        }
      }, 5000);
    } else if (!hasGenerating && pollTimer.current) {
      clearInterval(pollTimer.current); pollTimer.current = null;
    }
    return () => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; } };
  }, [chars, refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  async function addCharacter(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/projects/${id}/characters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", description: "", appearance: "", role: "", reference_prompt: "" });
    setAdding(false); setSaving(false);
    refresh();
  }

  async function generateAll() {
    if (!chars?.length) return;
    setGenAllLoading(true);
    for (const c of chars) {
      await fetch(`/api/characters/${c.id}/generate-all-models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    }
    setGenAllLoading(false);
    refresh();
  }

  async function pollResults() {
    const c = new AbortController(); setTimeout(() => c.abort(), 15000);
    await fetch("/api/poll", { signal: c.signal }).catch(() => {});
    refresh();
  }

  const inp = { width: "100%", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 10px", fontSize: 13 } as const;
  const lbl = { display: "block" as const, fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 700 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/projects" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 800, fontSize: 16 }}>◈</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${id}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>Project</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ color: "var(--muted)" }}>Characters</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={pollResults}>🔄 Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={generateAll} disabled={genAllLoading || !chars?.length}>
            {genAllLoading ? <span className="spinner" /> : "⚡"} Generate All
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>+ Add</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px" }}>
        <BaseImagePanel projectId={id} />

        {/* Add character form */}
        {adding && (
          <div className="card" style={{ padding: 20, marginBottom: 20, borderColor: "var(--accent)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New Character</h3>
            <form onSubmit={addCharacter}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={lbl}>NAME</label><input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jim Hawkins" required /></div>
                <div><label style={lbl}>ROLE</label><input style={inp} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. protagonist" /></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>DESCRIPTION</label><textarea style={{ ...inp, height: 48, resize: "vertical" as const }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Character background, personality..." /></div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>APPEARANCE</label><textarea style={{ ...inp, height: 64, resize: "vertical" as const }} value={form.appearance} onChange={e => setForm(f => ({ ...f, appearance: e.target.value }))} placeholder="Young boy, 14 years old, brown messy hair..." /></div>
              <div style={{ marginBottom: 16 }}><label style={lbl}>REFERENCE PROMPT (leave blank for auto)</label><textarea style={{ ...inp, height: 48, resize: "vertical" as const, fontFamily: "monospace", fontSize: 12 }} value={form.reference_prompt} onChange={e => setForm(f => ({ ...f, reference_prompt: e.target.value }))} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>{saving ? <span className="spinner" /> : "Create"}</button>
              </div>
            </form>
          </div>
        )}

        {/* Toolbar: view toggle + count */}
        {chars && chars.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{chars.length} character{chars.length !== 1 ? "s" : ""}</span>
            <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
              <button onClick={() => setViewMode("grid")} title="Grid" style={{ padding: "5px 12px", fontSize: 14, border: "none", cursor: "pointer", background: viewMode === "grid" ? "var(--accent)" : "var(--bg2)", color: viewMode === "grid" ? "#fff" : "var(--muted)" }}>⊞</button>
              <button onClick={() => setViewMode("list")} title="List" style={{ padding: "5px 12px", fontSize: 14, border: "none", cursor: "pointer", background: viewMode === "list" ? "var(--accent)" : "var(--bg2)", color: viewMode === "list" ? "#fff" : "var(--muted)" }}>☰</button>
            </div>
          </div>
        )}

        {/* Characters */}
        {!chars ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}><span className="spinner" /></div>
        ) : chars.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
            <div>No characters yet.</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>+ Add Character</button>
          </div>
        ) : viewMode === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {chars.map(c => {
              const completedImgs = (c.generations ?? []).filter(g => g.image_path).length;
              const thumb = c.reference_image ?? c.latest_image;
              const isGenerating = c.status === "generating";
              const statusColor = isGenerating ? "#f59e0b" : c.status === "done" ? "#22c55e" : c.status === "failed" ? "#ef4444" : "var(--border)";
              return (
                <div
                  key={c.id}
                  className="card"
                  style={{ overflow: "hidden", cursor: "pointer", border: `2px solid ${statusColor}`, transition: "transform .15s, box-shadow .15s" }}
                  onClick={() => router.push(`/projects/${id}/characters/${c.id}`)}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
                >
                  <div style={{ position: "relative", aspectRatio: "3/4", background: "var(--bg2)", overflow: "hidden" }}>
                    {isGenerating ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                        <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                        <span style={{ fontSize: 10, color: "#f59e0b" }}>Generating...</span>
                      </div>
                    ) : thumb ? (
                      <img src={thumb} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 40, color: "var(--muted)" }}>👤</div>
                    )}
                    {completedImgs > 0 && (
                      <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.7)", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>{completedImgs}</div>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{c.name}</div>
                    {c.role && <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>{c.role}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {chars.map(c => {
              const completedImgs = (c.generations ?? []).filter(g => g.image_path).length;
              const thumb = c.reference_image ?? c.latest_image;
              const isGenerating = c.status === "generating";
              const statusColor = isGenerating ? "#f59e0b" : c.status === "done" ? "#22c55e" : c.status === "failed" ? "#ef4444" : "var(--border)";
              return (
                <div
                  key={c.id}
                  className="card"
                  style={{ padding: 0, overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "stretch", border: `2px solid ${statusColor}` }}
                  onClick={() => router.push(`/projects/${id}/characters/${c.id}`)}
                >
                  {/* Thumb */}
                  <div style={{ width: 80, flexShrink: 0, background: "var(--bg2)", position: "relative" }}>
                    {isGenerating ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /></div>
                    ) : thumb ? (
                      <img src={thumb} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 28, color: "var(--muted)" }}>👤</div>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                    {c.role && <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{c.role}</div>}
                    {c.appearance && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4, maxHeight: 32, overflow: "hidden" }}>{c.appearance}</div>}
                  </div>
                  {/* Meta */}
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: statusColor, fontWeight: 700, textTransform: "uppercase" }}>{c.status}</span>
                    {completedImgs > 0 && <span style={{ fontSize: 10, color: "var(--muted)" }}>{completedImgs} images</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
