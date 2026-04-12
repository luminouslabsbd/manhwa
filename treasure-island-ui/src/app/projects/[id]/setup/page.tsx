"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

const NICHES = [
  "Adventure", "Fantasy", "Sci-Fi", "Romance", "Horror", "Historical",
  "Mystery", "Action", "Comedy", "Thriller", "Slice of Life", "Mythology",
  "Superhero", "Martial Arts", "Pirate", "Western", "Cyberpunk", "Steampunk",
];

const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600 };
const inp: React.CSSProperties = { width: "100%", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 12px", fontSize: 14 };

export default function SetupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "generate">("generate");
  const [storyboard, setStoryboard] = useState<File | null>(null);
  const [styleGuide, setStyleGuide] = useState<File | null>(null);
  const [niche, setNiche] = useState("Adventure");
  const [prompt, setPrompt] = useState("");
  const [episodeCount, setEpisodeCount] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const [suggestTimer, setSuggestTimer] = useState(0);
  const [preview, setPreview] = useState<{ episodes: { id: string; number: number; title: string; shot_count: number }[]; characterCount: number; totalShots: number } | null>(null);

  async function suggestPrompt() {
    setSuggesting(true);
    setSuggestTimer(0);
    const t = setInterval(() => setSuggestTimer(s => s + 1), 1000);
    try {
      const res = await fetch("/api/suggest-prompt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, projectName: "", projectId: id }),
      });
      const data = await res.json();
      if (data.prompt) setPrompt(data.prompt);
      else if (data.error) setError(`AI Suggest failed: ${data.error}`);
    } catch { setError("AI Suggest timed out. Try again — it's faster on the 2nd attempt."); }
    clearInterval(t);
    setSuggesting(false);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!storyboard) { setError("Storyboard file required"); return; }
    setLoading(true); setError(""); setPreview(null);
    setProgress("Extracting text from documents…");
    const form = new FormData();
    form.append("storyboard", storyboard);
    if (styleGuide) form.append("style_guide", styleGuide);
    setProgress("Parsing storyboard… (detecting format)");
    const res = await fetch(`/api/projects/${id}/parse-batch`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Parse failed"); setLoading(false); return; }
    const epsRes = await fetch(`/api/projects/${id}/episodes`);
    const eps = await epsRes.json();
    setPreview({ episodes: eps, characterCount: data.characters_found?.length ?? 0, totalShots: data.shots });
    setLoading(false); setProgress("");
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() && !file) { setError("Provide a prompt or upload a file"); return; }
    setLoading(true); setError(""); setPreview(null);
    setProgress("🤖 AI is creating your story, characters, episodes & shots… (60-120 seconds)");
    const form = new FormData();
    form.append("niche", niche);
    form.append("prompt", prompt);
    form.append("episode_count", String(episodeCount));
    if (file) form.append("file", file);
    const res = await fetch(`/api/projects/${id}/generate-story`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Generation failed"); setLoading(false); return; }
    const epsRes = await fetch(`/api/projects/${id}/episodes`);
    const eps = await epsRes.json();
    setPreview({ episodes: eps, characterCount: data.characters, totalShots: data.shots });
    setLoading(false); setProgress("");
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "10px 0", textAlign: "center", fontSize: 14, fontWeight: 700,
    cursor: "pointer", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--accent)" : "var(--muted)", background: "none", border: "none",
    borderBottomStyle: "solid", borderBottomWidth: 2,
    borderBottomColor: active ? "var(--accent)" : "transparent",
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: "100%", maxWidth: 600, padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Project Setup</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          Upload a script or let AI generate a complete story from your prompt.
        </p>

        {/* Mode tabs */}
        <div style={{ display: "flex", marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
          <button style={tabStyle(mode === "generate")} onClick={() => setMode("generate")}>🤖 AI Generate</button>
          <button style={tabStyle(mode === "upload")} onClick={() => setMode("upload")}>📄 Upload Script</button>
        </div>

        {error && <div style={{ background: "#2a1a1a", border: "1px solid var(--danger)", borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: "var(--danger)" }}>{error}</div>}

        {/* ── Preview panel ── */}
        {preview && (
          <div>
            <div style={{ background: "#0a1f0a", border: "1px solid #166534", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: "#4ade80", fontSize: 14, marginBottom: 8 }}>
                ✓ Generated: {preview.characterCount} characters · {preview.episodes.length} episodes · {preview.totalShots} shots
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {preview.episodes.map(ep => (
                  <div key={ep.id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 3 }}>EP {ep.number}</div>
                    <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, marginBottom: 4 }}>{ep.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{ep.shot_count} shots</div>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              Review the structure above. You can adjust individual shots on the project page after continuing.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => router.push(`/projects/${id}`)}>
                Continue to Project →
              </button>
              <button className="btn btn-secondary" onClick={() => setPreview(null)}>
                Regenerate
              </button>
            </div>
          </div>
        )}

        {!preview && mode === "generate" ? (
          <form onSubmit={handleGenerate}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>NICHE / GENRE</label>
                <select style={inp} value={niche} onChange={e => setNiche(e.target.value)}>
                  {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>EPISODES</label>
                <input type="number" style={inp} min={1} max={50} value={episodeCount} onChange={e => setEpisodeCount(parseInt(e.target.value) || 10)} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>STORY PROMPT *</label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={suggestPrompt} disabled={suggesting || loading}
                  style={{ fontSize: 12, padding: "4px 10px" }}>
                  {suggesting ? <><span className="spinner" /> AI thinking… {suggestTimer}s</> : `✨ AI Suggest for ${niche}`}
                </button>
              </div>
              <textarea style={{ ...inp, height: 120, resize: "vertical" }} value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder={`Describe your story idea, or click "AI Suggest" to auto-generate one…\n\ne.g. "A young orphan discovers a treasure map in an old pirate's chest…"`} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>REFERENCE FILE <span style={{ fontWeight: 400 }}>(optional — story, novel, outline)</span></label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg2)", border: `1px dashed ${file ? "var(--success)" : "var(--border)"}`, borderRadius: 6, padding: "12px 16px", cursor: "pointer" }}>
                <input type="file" accept=".pdf,.txt,.docx,.md" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
                <span style={{ fontSize: 20 }}>📎</span>
                <span style={{ fontSize: 13, color: file ? "var(--success)" : "var(--muted)" }}>{file ? file.name : "Upload a story file (PDF, TXT, DOCX) for AI to adapt"}</span>
              </label>
            </div>

            {loading && progress && (
              <div style={{ background: "var(--bg2)", borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: "var(--warning)", display: "flex", gap: 8, alignItems: "center" }}>
                <span className="spinner" /> {progress}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={loading || (!prompt.trim() && !file)} style={{ flex: 1 }}>
                {loading ? <><span className="spinner" /> Generating…</> : "🤖 Generate Story with AI"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => router.push(`/projects/${id}`)}>Skip</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleUpload}>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>STORYBOARD / SCRIPT *</label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg2)", border: `1px dashed ${storyboard ? "var(--success)" : "var(--border)"}`, borderRadius: 6, padding: "12px 16px", cursor: "pointer" }}>
                <input type="file" accept=".pdf,.txt,.docx,.md" style={{ display: "none" }} onChange={e => setStoryboard(e.target.files?.[0] ?? null)} />
                <span style={{ fontSize: 20 }}>📄</span>
                <span style={{ fontSize: 13, color: storyboard ? "var(--success)" : "var(--muted)" }}>{storyboard ? storyboard.name : "Click to upload PDF, TXT, or DOCX"}</span>
              </label>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={lbl}>STYLE GUIDE <span style={{ fontWeight: 400 }}>(optional)</span></label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg2)", border: `1px dashed ${styleGuide ? "var(--success)" : "var(--border)"}`, borderRadius: 6, padding: "12px 16px", cursor: "pointer" }}>
                <input type="file" accept=".pdf,.txt,.docx,.md" style={{ display: "none" }} onChange={e => setStyleGuide(e.target.files?.[0] ?? null)} />
                <span style={{ fontSize: 20 }}>🎨</span>
                <span style={{ fontSize: 13, color: styleGuide ? "var(--success)" : "var(--muted)" }}>{styleGuide ? styleGuide.name : "Click to upload style guide PDF, TXT, or DOCX"}</span>
              </label>
            </div>

            {loading && progress && (
              <div style={{ background: "var(--bg2)", borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13, color: "var(--warning)", display: "flex", gap: 8, alignItems: "center" }}>
                <span className="spinner" /> {progress}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={loading || !storyboard} style={{ flex: 1 }}>
                {loading ? <><span className="spinner" /> Analyzing…</> : "🤖 Analyze with Claude AI"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => router.push(`/projects/${id}`)}>Skip</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
