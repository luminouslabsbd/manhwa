"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "@/lib/toast";

const fetcher = (u: string) => { const c = new AbortController(); setTimeout(() => c.abort(), 6000); return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null); };

type Project = { id: string; name: string; shot_count: number; approved_count: number; video_count: number; episode_count: number; };
type Episode = { id: string; number: number; title: string; shot_count: number; done_count: number; approved_count: number; video_count: number; };

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project } = useSWR<Project>(`/api/projects/${id}`, fetcher);
  const { data: episodes, mutate } = useSWR<Episode[]>(`/api/projects/${id}/episodes`, fetcher, { revalidateOnFocus: false });
  const [genLoading, setGenLoading] = useState(false);

  async function generateAll() {
    if (!confirm("Queue ALL shots for generation? This will use GPU time.")) return;
    setGenLoading(true);
    const res = await fetch(`/api/projects/${id}/generate-all`, { method: "POST" });
    const data = await res.json();
    toast(`Queued ${data.queued} shots for generation`, "success");
    setGenLoading(false);
    mutate();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <nav style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/projects" style={{ fontWeight: 800, fontSize: 18, color: "var(--accent)", textDecoration: "none", letterSpacing: -0.5 }}>◈ Manhwa Studio</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{project?.name ?? "…"}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link href={`/projects/${id}/characters`} className="btn btn-secondary btn-sm">👤 Characters</Link>
          <Link href={`/projects/${id}/settings`} className="btn btn-secondary btn-sm">⚙️ Settings</Link>
          <Link href={`/projects/${id}/setup`} className="btn btn-secondary btn-sm">📝 Re-setup</Link>
          <a href={`/api/projects/${id}/download`} className="btn btn-secondary btn-sm" download>⬇ Download All</a>
          <button className="btn btn-primary btn-sm" onClick={generateAll} disabled={genLoading}>
            {genLoading ? <span className="spinner" /> : "⚡"} Generate All
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>
        {project && (
          <div style={{ display: "flex", gap: 24, margin: "20px 0", flexWrap: "wrap" }}>
            {[
              { label: "Episodes", val: project.episode_count, color: "var(--text)" },
              { label: "Total Shots", val: project.shot_count, color: "var(--text)" },
              { label: "Generated", val: project.approved_count, color: "var(--success)" },
              { label: "Videos", val: project.video_count, color: "var(--accent2)" },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: "12px 20px", flex: "1 1 120px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 16px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Episodes</h2>
        </div>

        {!episodes ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}><span className="spinner" /></div>
        ) : episodes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
            <div style={{ fontSize: 14 }}>No episodes yet.</div>
            <Link href={`/projects/${id}/setup`} className="btn btn-primary" style={{ marginTop: 16, display: "inline-flex" }}>Upload Storyboard</Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
            {episodes.map(ep => {
              const pct = ep.shot_count > 0 ? Math.round((ep.done_count / ep.shot_count) * 100) : 0;
              return (
                <Link key={ep.id} href={`/projects/${id}/episodes/${ep.id}`} style={{ textDecoration: "none" }}>
                  <div className="card" style={{ padding: 18, cursor: "pointer", transition: "border-color .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>EPISODE {ep.number}</div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: "var(--text)", lineHeight: 1.3 }}>{ep.title}</div>
                    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px" }}>🎬 {ep.shot_count} shots</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", background: "rgba(46,204,113,.1)", border: "1px solid rgba(46,204,113,.3)", borderRadius: 5, padding: "3px 8px" }}>✓ {ep.approved_count}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.3)", borderRadius: 5, padding: "3px 8px" }}>📹 {ep.video_count}</span>
                    </div>
                    <div style={{ background: "var(--bg2)", borderRadius: 4, height: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--success)" : "var(--accent)", transition: "width .3s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, fontWeight: 500 }}>{pct}% generated</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


