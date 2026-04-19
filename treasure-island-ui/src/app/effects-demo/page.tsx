"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "@/lib/toast";

// Must mirror the ClipEffect enum in ffmpeg-utils.ts + final-video UI.
type ClipEffect =
  | "none" | "fade-in" | "fade-out" | "fade-both"
  | "ken-burns" | "zoom-in" | "zoom-out"
  | "pan-left" | "pan-right" | "pan-up" | "pan-down"
  | "shake";

type EffectMeta = {
  id: ClipEffect;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  goodFor: string;
};

const EFFECTS: EffectMeta[] = [
  { id: "none",      label: "None",           emoji: "▫️", tagline: "Static — no motion, no fades",
    description: "Image is shown exactly as-is for the clip duration. No movement, no transitions.",
    goodFor: "Clips that already have their own motion (real videos), or when you want the viewer's eye to rest." },
  { id: "fade-in",   label: "Fade in",        emoji: "🌅", tagline: "Fades up from black",
    description: "Starts black, ramps to full image over the first ~0.4 s. Nothing else changes.",
    goodFor: "The first shot of an episode. Opening a new scene. Slow, quiet beats." },
  { id: "fade-out",  label: "Fade out",       emoji: "🌇", tagline: "Fades down to black",
    description: "Image fades to black over the last ~0.4 s of the clip.",
    goodFor: "Last shot of an episode. End of a scene before a hard cut." },
  { id: "fade-both", label: "Fade in + out",  emoji: "🕯", tagline: "Fade in AND fade out",
    description: "Fades from black at the start and to black at the end. Combination of the two above.",
    goodFor: "Isolated, punctuating shots — a title card or a dramatic reveal sandwiched between cuts." },
  { id: "ken-burns", label: "Ken Burns",      emoji: "🖼", tagline: "Slow, gentle zoom",
    description: "Very gentle slow zoom from 1.00× → 1.10× over the clip. Minimal movement.",
    goodFor: "Quiet, contemplative shots. Dialogue-heavy moments. When you want life without distraction." },
  { id: "zoom-in",   label: "Zoom in",        emoji: "🔎", tagline: "Push in toward the subject",
    description: "Scales 1.00× → 1.15× over the clip, centered. Faster and more dramatic than Ken Burns.",
    goodFor: "Emotional close-ups. Dramatic reveals. \"Wait, what's that…\" beats." },
  { id: "zoom-out",  label: "Zoom out",       emoji: "🔭", tagline: "Pull back to reveal scale",
    description: "Scales 1.15× → 1.00× over the clip — we start close and pull back.",
    goodFor: "Establishing shots. Revealing the scale of something (a landscape, a crowd, a threat)." },
  { id: "pan-left",  label: "Pan left",       emoji: "⬅️", tagline: "Camera pans from right to left",
    description: "Image is oversampled 1.18× and the viewport slides from the right edge to the left edge.",
    goodFor: "Landscapes, wide shots. Following movement. Scene-setting where the subject is off-screen." },
  { id: "pan-right", label: "Pan right",      emoji: "➡️", tagline: "Camera pans from left to right",
    description: "Same as Pan left but moving in the opposite direction — left edge to right edge.",
    goodFor: "Revealing something new. A character walking into frame. Right-to-left reads (Western directionality)." },
  { id: "pan-up",    label: "Pan up",         emoji: "⬆️", tagline: "Camera tilts upward",
    description: "Viewport slides from the bottom of the image to the top.",
    goodFor: "Revealing height — a castle, a tall character, the sky. Awe beats." },
  { id: "pan-down",  label: "Pan down",       emoji: "⬇️", tagline: "Camera tilts downward",
    description: "Viewport slides from the top of the image to the bottom.",
    goodFor: "Revealing something below — a chasm, a body on the ground, a secret hidden low." },
  { id: "shake",     label: "Handheld shake", emoji: "💥", tagline: "Subtle organic jitter",
    description: "Two-axis sinusoidal jitter on a scaled-up canvas. Feels like a handheld camera.",
    goodFor: "Action, combat, panic, earthquakes. Use sparingly — it's intense if you spread it across the whole episode." },
];

const SAMPLE_PRESETS = [
  { label: "Sample: cinematic landscape", url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1600&q=80" },
  { label: "Sample: portrait",            url: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=1600&q=80" },
  { label: "Sample: dramatic sky",        url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1600&q=80" },
];

type RenderState = { status: "idle" | "rendering" | "ready" | "error"; videoPath?: string; error?: string };

export default function EffectsDemoPage() {
  const [imageUrl, setImageUrl] = useState<string>(SAMPLE_PRESETS[0].url);
  const [durationMs, setDurationMs] = useState<number>(4000);
  const [caption, setCaption] = useState<string>("");
  const [renders, setRenders] = useState<Record<string, RenderState>>({});
  const [renderAllBusy, setRenderAllBusy] = useState(false);

  async function renderOne(effect: ClipEffect) {
    setRenders((r) => ({ ...r, [effect]: { status: "rendering" } }));
    try {
      const res = await fetch(`/api/effects-demo/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, effect, duration_ms: durationMs, caption: caption.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRenders((r) => ({ ...r, [effect]: { status: "error", error: j.error ?? "render failed" } }));
      } else {
        setRenders((r) => ({ ...r, [effect]: { status: "ready", videoPath: j.video_path } }));
      }
    } catch (err) {
      setRenders((r) => ({ ...r, [effect]: { status: "error", error: err instanceof Error ? err.message : "network error" } }));
    }
  }

  async function renderAll() {
    if (!imageUrl.trim()) { toast("Pick a sample image first", "warning"); return; }
    setRenderAllBusy(true);
    try {
      // Sequential so the ffmpeg pool doesn't get overwhelmed.
      for (const e of EFFECTS) { await renderOne(e.id); }
    } finally {
      setRenderAllBusy(false);
    }
  }

  function resetAll() {
    setRenders({});
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Header */}
      <nav style={{
        borderBottom: "1px solid var(--border)", background: "var(--bg2)", padding: "12px 24px",
        display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 48, zIndex: 30,
      }}>
        <Link href="/projects" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>Projects</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa" }}>🎛 Effects Demo</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={resetAll} className="btn btn-secondary btn-sm" disabled={Object.keys(renders).length === 0}>↺ Reset</button>
          <button onClick={renderAll} disabled={renderAllBusy}
            className="btn btn-sm"
            style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700 }}>
            {renderAllBusy ? <span className="spinner" /> : "🎬"} Render all {EFFECTS.length} effects
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px" }}>
        {/* Intro */}
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, maxWidth: 900 }}>
          Each card below renders a short preview of one motion effect applied to the sample image, so you can see
          exactly what &quot;pan-left&quot; or &quot;shake&quot; will do on a real shot. Renders are cached by image + effect + duration,
          so re-rendering the same combination is instant.
        </p>

        {/* Controls */}
        <div className="card" style={{ padding: 14, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 140px 1fr", gap: 12, alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Sample image URL or /generated/… path</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… or /generated/{projectId}/{file}.png"
              style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SAMPLE_PRESETS.map((p) => (
                <button key={p.url} onClick={() => setImageUrl(p.url)}
                  className="btn btn-xs"
                  style={{ background: imageUrl === p.url ? "rgba(167,139,250,.2)" : "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  {p.label}
                </button>
              ))}
            </div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Duration (s)</span>
            <input type="number" min={1.5} max={8} step={0.5}
              value={durationMs / 1000}
              onChange={(e) => setDurationMs(Math.max(1500, Math.min(8000, Math.round((parseFloat(e.target.value) || 4) * 1000))))}
              style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Caption preview (optional)</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Leave blank to omit captions from the previews"
              style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}
            />
          </label>
        </div>

        {/* Preview of source image */}
        {imageUrl && (
          <div style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "center", padding: 10, background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="source" style={{ width: 200, aspectRatio: "16/9", objectFit: "cover", borderRadius: 6, background: "#000" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>Source image</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace", wordBreak: "break-all" }}>{imageUrl}</div>
            </div>
          </div>
        )}

        {/* Effects grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
          {EFFECTS.map((e) => {
            const r = renders[e.id];
            const status = r?.status ?? "idle";
            return (
              <div key={e.id} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{e.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{e.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.tagline}</div>
                  </div>
                  <code style={{ fontSize: 10, color: "var(--muted)", background: "rgba(255,255,255,.04)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>{e.id}</code>
                </div>

                <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                  {status === "ready" && r?.videoPath ? (
                    <video key={r.videoPath} src={r.videoPath} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls autoPlay muted loop />
                  ) : status === "rendering" ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#a78bfa", flexDirection: "column", gap: 6 }}>
                      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3, borderColor: "#a78bfa transparent transparent transparent" }} />
                      <span style={{ fontSize: 11 }}>Rendering…</span>
                    </div>
                  ) : status === "error" ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", padding: 10, textAlign: "center" }}>
                      <div>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>⚠</div>
                        <div style={{ fontSize: 11 }}>{r?.error ?? "Render failed"}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>▶</div>
                        <div style={{ fontSize: 11 }}>Click Render to preview</div>
                      </div>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>{e.description}</p>
                <div style={{ fontSize: 10, color: "#34d399", lineHeight: 1.5 }}>
                  <b style={{ color: "#34d399" }}>Good for:</b> {e.goodFor}
                </div>

                <button
                  onClick={() => renderOne(e.id)}
                  disabled={status === "rendering"}
                  className="btn btn-sm"
                  style={{ marginTop: "auto", background: status === "ready" ? "var(--bg2)" : "#7c3aed", color: status === "ready" ? "var(--text)" : "#fff", border: status === "ready" ? "1px solid var(--border)" : "none", fontWeight: 700 }}>
                  {status === "rendering" ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Rendering…</> : status === "ready" ? "↻ Re-render" : "🎬 Render preview"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
