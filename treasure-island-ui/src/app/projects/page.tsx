"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";

const fetcher = (u: string) => { const c = new AbortController(); setTimeout(() => c.abort(), 6000); return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => []); };

type Project = { id: string; name: string; episode_count: number; shot_count: number; approved_count: number; generated_count: number; created_at: string; status: string; };

export default function ProjectsPage() {
  const { data: projects, mutate } = useSWR<Project[]>("/api/projects", fetcher);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const proj = await res.json();
    setLoading(false);
    setName(""); setCreating(false);
    mutate();
    window.location.href = `/projects/${proj.id}/setup`;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 20px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Projects</h1>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Project</button>
        </div>

        {creating && (
          <div style={{ background: "var(--bg3)", border: "1px solid var(--accent)", borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <form onSubmit={createProject} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                autoFocus value={name} onChange={e => setName(e.target.value)}
                placeholder="Project name (e.g. Treasure Island, One Piece Arc 1)"
                style={{ flex: 1, background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 12px", fontSize: 14 }}
              />
              <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
                {loading ? <span className="spinner" /> : "Create & Setup"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
            </form>
          </div>
        )}

        {!projects ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}><span className="spinner" /> Loading…</div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>◈</div>
            <div style={{ fontSize: 16 }}>No projects yet. Create your first manhwa project.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: 20, cursor: "pointer", transition: "border-color .15s", borderColor: "var(--border)" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, lineHeight: 1.3, color: "var(--text)" }}>{p.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "EPS",       val: p.episode_count,  color: "var(--text)" },
                      { label: "SHOTS",     val: p.shot_count,     color: "var(--text)" },
                      { label: "APPROVED",  val: p.approved_count, color: "#4ade80" },
                      { label: "GENERATED", val: p.generated_count,color: "#a78bfa" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "var(--bg2)", borderRadius: 6, padding: "8px 10px", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
