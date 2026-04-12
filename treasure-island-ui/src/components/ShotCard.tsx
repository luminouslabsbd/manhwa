"use client";
import { useState, useEffect } from "react";

const VAR_COLOR: Record<string, string> = {
  char: "#60a5fa", char_name: "#93c5fd", shot: "#4ade80",
  camera: "#f59e0b", env: "#2dd4bf", lighting: "#fb923c", style: "#a78bfa",
};

type FormulaSegment = { type: "text"; text: string } | { type: "var"; key: string };
function parseFormula(formula: string): FormulaSegment[] {
  const segs: FormulaSegment[] = [];
  let rem = formula;
  const re = /\[([a-z_]+)\]/;
  while (rem.length > 0) {
    const m = re.exec(rem);
    if (!m) { segs.push({ type: "text", text: rem }); break; }
    if (m.index > 0) segs.push({ type: "text", text: rem.slice(0, m.index) });
    segs.push({ type: "var", key: m[1] });
    rem = rem.slice(m.index + m[0].length);
  }
  return segs;
}

type Generation = { id: string; type: string; status: string; image_path: string | null; video_path: string | null; created_at: string; };
type Frame = { id: string; frame_number: number; description: string; needed: boolean; image_path: string | null; video_path: string | null; status: string; ai_suggested: boolean; };
type Shot = { id: string; shot_number: number; character: string | null; shot_description: string; environment: string; lighting: string; status: string; approved_image_id: string | null; approved_video_id: string | null; latest_image: string | null; latest_video: string | null; attempt_count: number; full_prompt: string; story_line: string | null; dialogue: string | null; anchor: string | null; audio_path?: string | null; video_audio_path?: string | null; generations?: Generation[]; frames?: Frame[]; prompt_template_id?: string | null; prompt_template_formula?: string | null; prompt_template_name?: string | null; template_resolved?: Record<string, string>; };

export default function ShotCard({ shot, onEdit, onImageClick, onGenerate, onFrameClick, onUpload }: {
  shot: Shot;
  onEdit: () => void;
  onImageClick?: () => void;
  onGenerate?: () => void;
  onFrameClick?: (frameId: string) => void;
  onUpload?: (file: File) => void;
  onRetryImage?: () => void;
  onRetryVideo?: () => void;
  onApprove?: (genId: string) => void;
  onApproveVideo?: (genId: string) => void;
  onGenerateVideo?: () => void;
  onRegenPrompt?: () => void;
  onEditTTS?: () => void;
}) {
const [genPending, setGenPending] = useState(false);
const [showFullPrompt, setShowFullPrompt] = useState(false);
useEffect(() => { if (shot.status !== "generating") setGenPending(false); }, [shot.status]);
const isGenerating = genPending || shot.status === "generating";
const inVideoState = shot.status === "video_done" || shot.status === "video_generating";
  const showVideo = inVideoState && shot.latest_video;
  const isApproved = ["approved", "video_generating", "video_done"].includes(shot.status);
  const isVideoGenerating = shot.status === "video_generating";
  const statusLabel = shot.status === "video_generating" ? "🎬 rendering…" : shot.status === "video_done" ? "🎬 video done" : shot.status;
  const statusBadge = shot.status === "video_generating" ? "generating" : shot.status === "video_done" ? "done" : shot.status;

  // Frames — only show "needed" ones
  const frames = (shot.frames ?? []).filter(f => f.needed);
  const hasFrames = frames.length > 0;

  const hasImages = (shot.generations ?? []).some(g => (g.type === "image" || g.type.startsWith("image:")) && g.image_path);
  const hasVideos = (shot.generations ?? []).some(g => g.type === "video" && g.video_path);
  const hasTTS = !!shot.audio_path;
  const hasReview = hasImages || hasVideos || hasTTS;

  const hasTemplate = !!shot.prompt_template_formula;
  const resolved = shot.template_resolved ?? {};

  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", border: shot.status === "video_done" ? "2px solid #7c3aed" : isApproved ? "2px solid #22c55e" : undefined }}>
      {/* Thumbnail */}
      <div
        style={{ position: "relative", background: "var(--bg2)", height: hasFrames ? 140 : 200, overflow: "hidden", cursor: "pointer" }}
        onClick={onImageClick}
      >
        {showVideo ? (
          <video src={shot.latest_video!} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline loop autoPlay />
        ) : shot.latest_image ? (
          <img src={shot.latest_image} alt={`Shot ${shot.shot_number}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 32 }}>
            {shot.status === "generating" ? <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} /> : "🎬"}
          </div>
        )}

        {/* Status badge */}
        <div style={{ position: "absolute", top: 8, left: 8 }}>
          <span className={`badge badge-${statusBadge}`}>{statusLabel}</span>
        </div>

        {/* Shot number */}
        <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.7)", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700, color: "#fff" }}>
          S{String(shot.shot_number).padStart(2, "0")}
        </div>

        {/* Video rendering overlay */}
        {isVideoGenerating && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(124,58,237,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderColor: "#7c3aed transparent transparent transparent" }} />
          </div>
        )}

        {/* Approval badges */}
        <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 4 }}>
          {shot.audio_path && <span style={{ background: "#059669", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>🎙</span>}
          {shot.video_audio_path && <span style={{ background: "#7c3aed", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>🎬🔊</span>}
          {shot.approved_image_id && !shot.video_audio_path && <span style={{ background: "#22c55e", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>✅</span>}
          {shot.approved_video_id && !shot.video_audio_path && <span style={{ background: "#7c3aed", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>📹</span>}
        </div>

        {!shot.latest_image && !showVideo && shot.status !== "generating" && (
          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 9, color: "rgba(255,255,255,.4)", background: "rgba(0,0,0,.5)", borderRadius: 4, padding: "2px 6px" }}>
            Click to review / generate
          </div>
        )}
      </div>

      {/* Frame strip — shown only when frames exist */}
      {hasFrames && (
        <div style={{ display: "flex", gap: 3, padding: "4px 6px", background: "rgba(0,0,0,.3)", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          {frames.map((f) => (
            <button key={f.id} onClick={e => { e.stopPropagation(); onFrameClick?.(f.id); }} title={`Frame ${f.frame_number}: ${f.description}`} style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 5, overflow: "hidden", border: f.image_path ? "2px solid rgba(96,165,250,.5)" : "2px dashed rgba(255,255,255,.2)",
              background: "rgba(0,0,0,.4)", cursor: "pointer", position: "relative", padding: 0,
            }}>
              {f.image_path
                ? <img src={f.image_path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : f.status === "generating"
                  ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                  : <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 9, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>F{f.frame_number}</span>}
              {f.ai_suggested && (
                <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: 7, background: "rgba(96,165,250,.8)", borderRadius: "3px 0 0 0", padding: "1px 2px", color: "#fff" }}>AI</span>
              )}
            </button>
          ))}
          <button onClick={e => { e.stopPropagation(); onFrameClick?.("__add__"); }} title="Add frame" style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: 5, border: "2px dashed rgba(255,255,255,.15)",
            background: "transparent", cursor: "pointer", color: "rgba(255,255,255,.3)", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
        </div>
      )}

      {/* Info */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        {shot.character && <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>{shot.character}</div>}
        {shot.anchor && <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, lineHeight: 1.3, maxHeight: 24, overflow: "hidden" }}>📖 {shot.anchor}</div>}
        {shot.dialogue && <div style={{ fontSize: 10, color: "#fde68a", lineHeight: 1.3, maxHeight: 28, overflow: "hidden", fontStyle: "italic" }}>🗨 "{shot.dialogue.length > 60 ? shot.dialogue.slice(0, 60) + "…" : shot.dialogue}"</div>}

        {/* Prompt display */}
        <div style={{ position: "relative", flex: 1 }}>
          {hasTemplate ? (
            /* Template formula with colored chips */
            <div style={{ fontSize: 11, lineHeight: 1.5, maxHeight: 44, overflow: "hidden" }}>
              {parseFormula(shot.prompt_template_formula!).map((seg, i) =>
                seg.type === "text"
                  ? <span key={i} style={{ color: "var(--muted)", fontFamily: "monospace" }}>{seg.text}</span>
                  : <span key={i} title={resolved[seg.key] ? `${seg.key}: ${resolved[seg.key].slice(0, 120)}` : seg.key}
                      style={{ color: VAR_COLOR[seg.key] ?? "#a78bfa", background: `${VAR_COLOR[seg.key] ?? "#a78bfa"}18`, borderRadius: 3, padding: "0 4px", fontFamily: "monospace", fontSize: 10, fontWeight: 700, cursor: "default" }}>
                      [{seg.key}]
                    </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.4, maxHeight: 44, overflow: "hidden", fontFamily: "monospace" }}>{shot.full_prompt}</div>
          )}

          {/* Full prompt popover */}
          <button onClick={e => { e.stopPropagation(); setShowFullPrompt(v => !v); }} title="View full rendered prompt"
            style={{ position: "absolute", top: 0, right: 0, fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid rgba(255,255,255,.1)", background: "rgba(0,0,0,.4)", color: "rgba(255,255,255,.4)", cursor: "pointer" }}>
            📋
          </button>
          {showFullPrompt && (
            <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", boxShadow: "0 8px 32px rgba(0,0,0,.6)" }}>
              {hasTemplate && <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, marginBottom: 6 }}>📋 {shot.prompt_template_name} → rendered</div>}
              <div style={{ fontSize: 10, color: "var(--text)", fontFamily: "monospace", lineHeight: 1.5, maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{shot.full_prompt}</div>
              <button onClick={() => setShowFullPrompt(false)} style={{ marginTop: 6, fontSize: 9, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>Close</button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 10, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>🏠 {shot.environment}</span>
          <span>💡 {shot.lighting}</span>
          {hasTemplate && <span style={{ color: "#a78bfa", fontSize: 9, fontWeight: 700 }}>📋 {shot.prompt_template_name}</span>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button className="btn btn-secondary btn-xs" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); onEdit(); }}>✏ Edit</button>
          <button className="btn btn-primary btn-xs" style={{ flex: 1, opacity: isGenerating ? 0.5 : 1, cursor: isGenerating ? "not-allowed" : "pointer" }} onClick={e => { e.stopPropagation(); if (!isGenerating) { setGenPending(true); onGenerate?.(); } }} title={isGenerating ? "Generating…" : "Generate (single model)"} disabled={isGenerating}>
            {isGenerating ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, display: "inline-block" }} /> : "⚡ Gen"}
          </button>
          {hasReview ? (
            <button className="btn btn-xs" style={{ flex: 2, background: "var(--accent, #3b82f6)", color: "#fff", border: "none", borderRadius: 4, fontWeight: 700 }} onClick={e => { e.stopPropagation(); onImageClick?.(); }} title="Open review">🎬 Review</button>
          ) : (
            <button className="btn btn-xs" style={{ flex: 2, background: "var(--border)", color: "var(--muted)", border: "none", borderRadius: 4, fontWeight: 700, cursor: "not-allowed", opacity: 0.5 }} title="Nothing to review yet" disabled>🎬 Review</button>
          )}
        </div>
      </div>
    </div>
  );
}
