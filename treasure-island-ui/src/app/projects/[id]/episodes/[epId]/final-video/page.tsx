"use client";
import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";

// ─── Types (mirror the API shape) ───────────────────────────────────────
type ShotSummary = {
  id: string;
  shot_number: number;
  character: string | null;
  story_line: string | null;
  dialogue: string | null;
  approved_image_id: string | null;
  approved_video_id: string | null;
  video_path: string | null;
  video_audio_path: string | null;
  image_path: string | null;
  audio_path: string | null;
  duration_ms: number | null;
  has_video: boolean;
  has_image: boolean;
  has_tts: boolean;
  ready: boolean;
};

type RenderRow = {
  id: string;
  type: string;
  status: string;
  video_path: string | null;
  created_at: string;
  completed_at: string | null;
};

type ApiData = {
  episode: { id: string; number: number; title: string; project_id: string };
  shots: ShotSummary[];
  renders: RenderRow[];
};

type ClipSource = "shot_video_with_audio" | "shot_video" | "shot_image" | "custom";
type ClipEffect =
  | "none"
  | "fade-in"
  | "fade-out"
  | "fade-both"
  | "ken-burns"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "shake";
type ClipTransition = "cut" | "fade" | "crossfade";

type TimelineClip = {
  key: string;             // UI-only stable key
  shot_id?: string;
  source: ClipSource;
  custom_video_url?: string;
  custom_label?: string;
  include: boolean;
  duration_ms?: number;    // override; undefined = source default
  effect: ClipEffect;
  transition: ClipTransition; // transition INTO this clip
  transition_ms: number;
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const EFFECT_OPTS: { value: ClipEffect; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade-in", label: "Fade in" },
  { value: "fade-out", label: "Fade out" },
  { value: "fade-both", label: "Fade in + out" },
  { value: "ken-burns", label: "Ken Burns (slow zoom)" },
  { value: "zoom-in", label: "Zoom in" },
  { value: "zoom-out", label: "Zoom out" },
  { value: "pan-left", label: "Pan left" },
  { value: "pan-right", label: "Pan right" },
  { value: "pan-up", label: "Pan up" },
  { value: "pan-down", label: "Pan down" },
  { value: "shake", label: "Handheld shake" },
];

const TRANS_OPTS: { value: ClipTransition; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade through black" },
  { value: "crossfade", label: "Crossfade" },
];

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(1);
  return `${m}m ${sec}s`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ──────────────────────────────────────────────────────────────────────
export default function FinalVideoPage() {
  const { id: projectId, epId } = useParams<{ id: string; epId: string }>();
  const { data, mutate, isLoading } = useSWR<ApiData>(
    `/api/episodes/${epId}/final-video`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const storageKey = `final-video:${epId}`;
  type Persisted = {
    clips?: TimelineClip[];
    width?: number; height?: number; fps?: number;
    captionSource?: "off" | "dialogue" | "story_line";
    captionFontSize?: number;
    captionBottomPad?: number;
    captionBgOpacity?: number;
  };
  const persisted: Persisted = (() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) as Persisted : {};
    } catch { return {}; }
  })();

  const [clips, setClips] = useState<TimelineClip[]>(persisted.clips ?? []);
  const [width, setWidth] = useState(persisted.width ?? 1280);
  const [height, setHeight] = useState(persisted.height ?? 720);
  const [fps, setFps] = useState(persisted.fps ?? 24);
  const [rendering, setRendering] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [captionSource, setCaptionSource] = useState<"off" | "dialogue" | "story_line">(persisted.captionSource ?? "off");
  const [captionFontSize, setCaptionFontSize] = useState(persisted.captionFontSize ?? 28);
  const [captionBottomPad, setCaptionBottomPad] = useState(persisted.captionBottomPad ?? 40);
  const [captionBgOpacity, setCaptionBgOpacity] = useState(persisted.captionBgOpacity ?? 0.55);

  // Persist timeline + settings to localStorage whenever anything changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: Persisted = { clips, width, height, fps, captionSource, captionFontSize, captionBottomPad, captionBgOpacity };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch { /* quota or serialization — ignore */ }
  }, [storageKey, clips, width, height, fps, captionSource, captionFontSize, captionBottomPad, captionBgOpacity]);

  // Seed the timeline from approved/ready shots the first time data arrives.
  const seededFor = useMemo(() => data?.episode?.id ?? null, [data?.episode?.id]);
  useEffect(() => {
    if (!data) return;
    setClips((prev) => {
      if (prev.length > 0) return prev; // user has started editing
      return data.shots
        .filter((s) => s.ready)
        .map<TimelineClip>((s) => ({
          key: uid(),
          shot_id: s.id,
          source: s.video_audio_path
            ? "shot_video_with_audio"
            : s.has_video
              ? "shot_video"
              : "shot_image",
          include: true,
          duration_ms: undefined,
          effect: "none",
          transition: "cut",
          transition_ms: 500,
        }));
    });
  }, [seededFor, data]);

  const shotMap = useMemo(() => {
    const m = new Map<string, ShotSummary>();
    for (const s of data?.shots ?? []) m.set(s.id, s);
    return m;
  }, [data?.shots]);

  function patchClip(key: string, patch: Partial<TimelineClip>) {
    setClips((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }
  function removeClip(key: string) {
    setClips((cs) => cs.filter((c) => c.key !== key));
  }
  function moveClip(key: string, dir: -1 | 1) {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.key === key);
      if (i < 0) return cs;
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const copy = cs.slice();
      const [it] = copy.splice(i, 1);
      copy.splice(j, 0, it);
      return copy;
    });
  }
  function insertCustomClip(afterKey: string | null) {
    const url = prompt("Custom clip URL or /generated/… path (leave blank to cancel):");
    if (!url) return;
    const label = prompt("Label for this clip (optional):") ?? "";
    const durInput = prompt("Duration in seconds (optional, e.g. 3):");
    const dur = durInput ? parseFloat(durInput) : NaN;
    const newClip: TimelineClip = {
      key: uid(),
      source: "custom",
      custom_video_url: url.trim(),
      custom_label: label.trim() || "Custom clip",
      include: true,
      duration_ms: Number.isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : undefined,
      effect: "none",
      transition: "cut",
      transition_ms: 500,
    };
    setClips((cs) => {
      if (afterKey == null) return [...cs, newClip];
      const i = cs.findIndex((c) => c.key === afterKey);
      if (i < 0) return [...cs, newClip];
      const copy = cs.slice();
      copy.splice(i + 1, 0, newClip);
      return copy;
    });
  }
  function resetFromShots() {
    if (!data) return;
    setClips(data.shots.filter((s) => s.ready).map<TimelineClip>((s) => ({
      key: uid(),
      shot_id: s.id,
      source: s.video_audio_path
        ? "shot_video_with_audio"
        : s.has_video
          ? "shot_video"
          : "shot_image",
      include: true,
      duration_ms: undefined,
      effect: "none",
      transition: "cut",
      transition_ms: 500,
    })));
  }

  const includedClips = clips.filter((c) => c.include);

  // Estimate total duration, accounting for transitions that eat into previous clip time.
  const totalMs = useMemo(() => {
    let total = 0;
    for (let i = 0; i < includedClips.length; i++) {
      const c = includedClips[i];
      const shot = c.shot_id ? shotMap.get(c.shot_id) : null;
      const baseDur = c.duration_ms ?? shot?.duration_ms ?? 3000;
      total += baseDur;
      if (i > 0 && (c.transition === "fade" || c.transition === "crossfade")) {
        total -= Math.max(100, c.transition_ms);
      }
    }
    return Math.max(0, total);
  }, [includedClips, shotMap]);

  async function renderFinal() {
    if (includedClips.length === 0) { toast("Add at least one clip", "warning"); return; }
    setRendering(true);
    try {
      const body = {
        width, height, fps,
        captions: captionSource === "off" ? { source: "off" as const } : {
          source: captionSource,
          font_size: captionFontSize,
          bottom_pad: captionBottomPad,
          bg_opacity: captionBgOpacity,
        },
        clips: includedClips.map((c) => ({
          shot_id: c.shot_id,
          source: c.source,
          custom_video_url: c.source === "custom" ? c.custom_video_url : undefined,
          duration_ms: c.duration_ms,
          effect: c.effect,
          transition: c.transition,
          transition_ms: c.transition_ms,
        })),
      };
      const res = await fetch(`/api/episodes/${epId}/final-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) { toast(j.error ?? "Render failed", "error"); }
      else { toast("Final video rendered", "success"); mutate(); }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Render failed", "error");
    } finally {
      setRendering(false);
    }
  }

  async function runAiPlan() {
    if (!data) return;
    setPlanning(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/final-video/ai-plan`, { method: "POST" });
      const j = await res.json() as { ok?: boolean; plan?: Array<{ shot_id: string; duration_ms: number; effect: ClipEffect; transition: ClipTransition; transition_ms: number }>; error?: string };
      if (!res.ok || !j.plan) {
        toast(j.error ?? "AI plan failed", "error");
        return;
      }
      const planMap = new Map(j.plan.map((p) => [p.shot_id, p]));

      // Seed clips from plan if the timeline is empty, otherwise just apply settings
      // to every clip that has a matching shot_id.
      setClips((prev) => {
        const source = prev.length > 0 ? prev : (data.shots.filter((s) => s.ready).map<TimelineClip>((s) => ({
          key: uid(),
          shot_id: s.id,
          source: s.video_audio_path ? "shot_video_with_audio" : s.has_video ? "shot_video" : "shot_image",
          include: true,
          duration_ms: undefined,
          effect: "none",
          transition: "cut",
          transition_ms: 500,
        })));
        let idx = 0;
        return source.map((c) => {
          const p = c.shot_id ? planMap.get(c.shot_id) : undefined;
          if (!p) return c;
          const next = {
            ...c,
            duration_ms: p.duration_ms,
            effect: p.effect,
            transition: idx === 0 ? "cut" as const : p.transition,
            transition_ms: p.transition_ms,
          };
          idx++;
          return next;
        });
      });
      toast(`AI plan applied to ${j.plan.length} shots`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI plan failed", "error");
    } finally {
      setPlanning(false);
    }
  }

  function clearSavedSettings() {
    if (typeof window === "undefined") return;
    if (!confirm("Clear saved timeline + caption settings for this episode?")) return;
    window.localStorage.removeItem(storageKey);
    setClips([]);
    setWidth(1280); setHeight(720); setFps(24);
    setCaptionSource("off"); setCaptionFontSize(28); setCaptionBottomPad(40); setCaptionBgOpacity(0.55);
    toast("Saved settings cleared", "success");
  }

  async function deleteRender(genId: string) {
    if (!confirm("Delete this render? The video file will be removed and cannot be recovered.")) return;
    setDeletingId(genId);
    try {
      const res = await fetch(`/api/generations/${genId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) toast(j.error ?? "Delete failed", "error");
      else { toast("Render deleted", "success"); mutate(); }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function enhance(genId?: string) {
    setEnhancing(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/final-video/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation_id: genId, mode: "ffmpeg", scale: 1.5 }),
      });
      const j = await res.json();
      if (!res.ok) toast(j.error ?? "Enhance failed", "error");
      else { toast("Enhanced render ready", "success"); mutate(); }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enhance failed", "error");
    } finally {
      setEnhancing(false);
    }
  }

  const latestRender = data?.renders?.[0] ?? null;
  const missingShots = useMemo(() => (data?.shots ?? []).filter((s) => !s.ready), [data?.shots]);
  const [showMissing, setShowMissing] = useState(false);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Breadcrumb / header */}
      <nav style={{
        borderBottom: "1px solid var(--border)", background: "var(--bg2)", padding: "10px 24px",
        display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 48, zIndex: 30,
      }}>
        <Link href="/projects" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>Projects</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${projectId}`} style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>Project</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${projectId}/episodes/${epId}`} style={{ color: "var(--text)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
          {data?.episode ? `EP ${data.episode.number}: ${data.episode.title}` : "Episode"}
        </Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>🎞 Final Video</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Total ~ {fmtMs(totalMs)}</span>
          <Link href="/effects-demo" target="_blank"
            className="btn btn-secondary btn-sm"
            title="Preview each motion effect on a sample image">
            🎛 Effects demo ↗
          </Link>
          <button
            onClick={runAiPlan}
            disabled={planning || !data}
            className="btn btn-sm"
            title="Let the LLM pick per-shot durations, effects, and transitions"
            style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700 }}>
            {planning ? <span className="spinner" /> : "✨"} AI Plan
          </button>
          <button className="btn btn-secondary btn-sm" onClick={resetFromShots} disabled={!data}>↺ Reset from shots</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={renderFinal}
            disabled={rendering || includedClips.length === 0}
            style={{ background: "#7c3aed", border: "none" }}>
            {rendering ? <span className="spinner" /> : "🎬"} Render Final
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        {/* ─── Timeline column ─── */}
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Timeline</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
            Pick which shots to include, reorder them, tweak each clip&apos;s duration, add an entrance effect, and choose a transition into the clip.
            Use <b>+ Insert custom clip</b> to drop in a title card, b-roll, or any URL-based video between shots.
          </p>

          {/* Missing shots banner */}
          {missingShots.length > 0 && (
            <div style={{
              marginBottom: 14,
              borderRadius: 10,
              border: "1px solid rgba(245,158,11,.35)",
              background: "rgba(245,158,11,.08)",
              overflow: "hidden",
            }}>
              <button
                onClick={() => setShowMissing((v) => !v)}
                style={{
                  width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
                  background: "transparent", border: "none", cursor: "pointer", color: "#fbbf24",
                  fontSize: 13, fontWeight: 700, textAlign: "left",
                }}>
                <span>⚠️ {missingShots.length} shot{missingShots.length !== 1 ? "s" : ""} missing</span>
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                  no approved image or video — skipped from the render
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11 }}>{showMissing ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {showMissing && (
                <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {missingShots.map((s) => {
                    const missingParts: string[] = [];
                    if (!s.has_image) missingParts.push("image");
                    if (!s.has_video) missingParts.push("video");
                    if (!s.has_tts) missingParts.push("TTS");
                    return (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                        background: "rgba(0,0,0,.15)", border: "1px solid rgba(255,255,255,.06)",
                        borderRadius: 7,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", background: "rgba(245,158,11,.15)", padding: "2px 7px", borderRadius: 4, flexShrink: 0 }}>
                          S{String(s.shot_number).padStart(2, "0")}
                        </span>
                        {s.character && <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, flexShrink: 0 }}>{s.character}</span>}
                        <span style={{ fontSize: 11, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.story_line ?? s.dialogue ?? ""}
                        </span>
                        <span style={{ fontSize: 10, color: "#f87171", fontWeight: 600, flexShrink: 0 }}>
                          missing: {missingParts.join(", ")}
                        </span>
                        <Link
                          href={`/projects/${projectId}/episodes/${epId}`}
                          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, background: "rgba(96,165,250,.15)", color: "#60a5fa", textDecoration: "none", fontWeight: 700, border: "1px solid rgba(96,165,250,.3)", flexShrink: 0 }}>
                          Open →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isLoading && <div style={{ padding: 30, textAlign: "center" }}><span className="spinner" /></div>}

          {!isLoading && clips.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎞</div>
              <div style={{ fontSize: 14, marginBottom: 10 }}>No ready shots found. Approve video or TTS+video for shots first.</div>
              <Link href={`/projects/${projectId}/episodes/${epId}`} className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>← Back to episode</Link>
            </div>
          )}

          {clips.map((c, i) => {
            const shot = c.shot_id ? shotMap.get(c.shot_id) : null;
            const label = c.source === "custom" ? (c.custom_label ?? "Custom clip") : shot ? `S${String(shot.shot_number).padStart(2, "0")}` : "(missing)";
            const isImageClip = c.source === "shot_image";
            // On the Final Video page, prefer the shot's rendered video for the thumbnail
            // whenever one exists — even for image-source clips — so the preview reflects
            // what viewers will actually see. Falls back to the still image if no video.
            const previewVideoUrl = c.source === "custom"
              ? c.custom_video_url
              : shot?.video_audio_path ?? shot?.video_path ?? null;
            const previewImageUrl = !previewVideoUrl && isImageClip ? shot?.image_path ?? null : null;
            const srcDur = c.duration_ms ?? shot?.duration_ms ?? (isImageClip ? 3000 : null);

            return (
              <div key={c.key}>
                {/* Transition pill between clips */}
                {i > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 6px 18px", fontSize: 11, color: "var(--muted)" }}>
                    <span style={{ width: 2, height: 18, background: "var(--border)" }} />
                    <select
                      value={c.transition}
                      onChange={(e) => patchClip(c.key, { transition: e.target.value as ClipTransition })}
                      style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", fontSize: 11 }}>
                      {TRANS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {c.transition !== "cut" && (
                      <>
                        <span>duration</span>
                        <input
                          type="number" min={100} max={4000} step={50}
                          value={c.transition_ms}
                          onChange={(e) => patchClip(c.key, { transition_ms: Math.max(100, parseInt(e.target.value) || 500) })}
                          style={{ width: 70, background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", fontSize: 11 }}
                        />
                        <span>ms</span>
                      </>
                    )}
                  </div>
                )}

                {/* Clip card */}
                <div className="card" style={{ padding: 10, display: "flex", gap: 12, alignItems: "stretch", borderLeft: c.include ? "3px solid #a78bfa" : "3px solid var(--border)", opacity: c.include ? 1 : 0.5 }}>
                  {/* Preview */}
                  <div style={{ flexShrink: 0, width: 200, aspectRatio: "16/9", background: "#000", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                    {previewImageUrl ? (
                      <img src={previewImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : previewVideoUrl ? (
                      <video src={previewVideoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted loop preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#f87171" }}>No source</div>
                    )}
                    <div style={{ position: "absolute", top: 4, left: 4, fontSize: 10, fontWeight: 800, color: "#fff", background: "rgba(124,58,237,.9)", padding: "2px 6px", borderRadius: 4 }}>{label}</div>
                    <div style={{ position: "absolute", top: 4, right: 4, fontSize: 9, fontWeight: 800, color: "#fff", background: isImageClip ? "rgba(245,158,11,.9)" : "rgba(34,197,94,.85)", padding: "2px 5px", borderRadius: 4 }}>{isImageClip ? "IMG" : "VID"}</div>
                    {srcDur != null && (
                      <div style={{ position: "absolute", bottom: 4, right: 4, fontSize: 10, color: "#fff", background: "rgba(0,0,0,.7)", padding: "2px 6px", borderRadius: 4 }}>{fmtMs(srcDur)}</div>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                        <input type="checkbox" checked={c.include} onChange={(e) => patchClip(c.key, { include: e.target.checked })} />
                        Include
                      </label>
                      {shot?.character && <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>{shot.character}</span>}
                      {c.source === "shot_video_with_audio" && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,.15)", color: "#34d399", fontWeight: 700 }}>+ TTS</span>}
                      {c.source === "shot_image" && shot?.has_tts && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,.15)", color: "#34d399", fontWeight: 700 }}>+ TTS</span>}
                      {c.source === "shot_image" && !shot?.has_tts && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", color: "var(--muted)", fontWeight: 700 }}>silent</span>}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button onClick={() => moveClip(c.key, -1)} disabled={i === 0} className="btn btn-secondary btn-xs">▲</button>
                        <button onClick={() => moveClip(c.key, 1)} disabled={i === clips.length - 1} className="btn btn-secondary btn-xs">▼</button>
                        <button onClick={() => removeClip(c.key)} className="btn btn-xs" style={{ background: "rgba(239,68,68,.12)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)" }}>✕</button>
                      </div>
                    </div>

                    {shot?.story_line && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{shot.story_line}</div>}
                    {shot?.dialogue && <div style={{ fontSize: 11, color: "#fde68a", fontStyle: "italic", lineHeight: 1.4 }}>&ldquo;{shot.dialogue}&rdquo;</div>}
                    {c.source === "custom" && c.custom_video_url && (
                      <div style={{ fontSize: 11, color: "var(--muted)", wordBreak: "break-all" }}>{c.custom_video_url}</div>
                    )}

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11, marginTop: "auto" }}>
                      {/* Source switch (shot clips) — only when there's more than one option */}
                      {c.source !== "custom" && shot && (() => {
                        const opts: { v: ClipSource; label: string }[] = [];
                        if (shot.video_audio_path) opts.push({ v: "shot_video_with_audio", label: "Video + TTS" });
                        if (shot.has_video) opts.push({ v: "shot_video", label: "Video only" });
                        if (shot.has_image) opts.push({ v: "shot_image", label: shot.has_tts ? "Image + TTS" : "Image only" });
                        if (opts.length < 2) return null;
                        return (
                          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color: "var(--muted)" }}>Source</span>
                            <select
                              value={c.source}
                              onChange={(e) => patchClip(c.key, { source: e.target.value as ClipSource })}
                              style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px", fontSize: 11 }}>
                              {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                            </select>
                          </label>
                        );
                      })()}

                      {/* Duration override */}
                      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "var(--muted)" }}>Duration</span>
                        <input
                          type="number" min={0.2} step={0.1}
                          placeholder={srcDur ? (srcDur / 1000).toFixed(1) : "auto"}
                          value={c.duration_ms != null ? (c.duration_ms / 1000).toFixed(1) : ""}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            patchClip(c.key, { duration_ms: Number.isFinite(v) && v > 0 ? Math.round(v * 1000) : undefined });
                          }}
                          style={{ width: 60, background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px", fontSize: 11 }}
                        />
                        <span style={{ color: "var(--muted)" }}>s</span>
                      </label>

                      {/* Effect */}
                      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "var(--muted)" }}>Effect</span>
                        <select
                          value={c.effect}
                          onChange={(e) => patchClip(c.key, { effect: e.target.value as ClipEffect })}
                          style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px", fontSize: 11 }}>
                          {EFFECT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {/* + button after each clip */}
                <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
                  <button onClick={() => insertCustomClip(c.key)}
                    style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px dashed var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>
                    + Insert custom clip here
                  </button>
                </div>
              </div>
            );
          })}

          {clips.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => insertCustomClip(null)} className="btn btn-secondary btn-sm">+ Append custom clip</button>
            </div>
          )}
        </section>

        {/* ─── Right column ─── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Output settings */}
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Output settings</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>Width</span>
                <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 1280)}
                  style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>Height</span>
                <input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value) || 720)}
                  style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3, gridColumn: "1 / -1" }}>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>FPS</span>
                <select value={fps} onChange={(e) => setFps(parseInt(e.target.value))}
                  style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px" }}>
                  <option value={24}>24</option>
                  <option value={25}>25</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {[
                { w: 1280, h: 720, label: "720p" },
                { w: 1920, h: 1080, label: "1080p" },
                { w: 1080, h: 1920, label: "9:16" },
              ].map((p) => (
                <button key={p.label} onClick={() => { setWidth(p.w); setHeight(p.h); }}
                  className="btn btn-xs" style={{ border: "1px solid var(--border)", background: width === p.w && height === p.h ? "rgba(167,139,250,.2)" : "var(--bg2)", color: "var(--text)" }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, display: "flex", justifyContent: "space-between" }}>
              <span>Clips: <b>{includedClips.length}</b></span>
              <span>Est: <b>{fmtMs(totalMs)}</b></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700 }}>💾 Auto-saved to this browser</span>
              <button onClick={clearSavedSettings}
                className="btn btn-xs"
                style={{ marginLeft: "auto", background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}>
                Clear
              </button>
            </div>
          </div>

          {/* Captions */}
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              💬 Captions
              {captionSource !== "off" && <span style={{ fontSize: 10, color: "#34d399", background: "rgba(52,211,153,.12)", padding: "1px 6px", borderRadius: 4 }}>ON</span>}
            </h3>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>Source</span>
              <select
                value={captionSource}
                onChange={(e) => setCaptionSource(e.target.value as "off" | "dialogue" | "story_line")}
                style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px" }}>
                <option value="off">Off</option>
                <option value="dialogue">Dialogue (shot.dialogue)</option>
                <option value="story_line">Story line (shot.story_line)</option>
              </select>
            </label>
            {captionSource !== "off" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginTop: 10 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>Font size (px)</span>
                    <input type="number" min={10} max={80} value={captionFontSize}
                      onChange={(e) => setCaptionFontSize(Math.max(10, parseInt(e.target.value) || 28))}
                      style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px" }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>Bottom pad (px)</span>
                    <input type="number" min={0} max={300} value={captionBottomPad}
                      onChange={(e) => setCaptionBottomPad(Math.max(0, parseInt(e.target.value) || 0))}
                      style={{ background: "var(--bg2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px" }} />
                  </label>
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginTop: 10 }}>
                  <span style={{ color: "var(--muted)", fontSize: 11 }}>
                    Background opacity <b>{captionBgOpacity.toFixed(2)}</b>
                  </span>
                  <input type="range" min={0} max={1} step={0.05}
                    value={captionBgOpacity}
                    onChange={(e) => setCaptionBgOpacity(parseFloat(e.target.value))} />
                </label>
                <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                  Text is taken from each shot&apos;s <b>{captionSource === "dialogue" ? "dialogue" : "story line"}</b>.
                  Shots with no {captionSource === "dialogue" ? "dialogue" : "story line"} show no caption.
                </p>
              </>
            )}
          </div>

          {/* Latest render preview */}
          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Latest render</h3>
            {latestRender?.video_path ? (
              <>
                <video src={latestRender.video_path} controls style={{ width: "100%", borderRadius: 6, background: "#000", aspectRatio: "16/9" }} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  {latestRender.type === "final_video_enhanced" ? "Enhanced · " : ""}{new Date(latestRender.created_at).toLocaleString()}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <a href={latestRender.video_path} download className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: "center", textDecoration: "none" }}>⬇ Download</a>
                  <button
                    onClick={() => enhance(latestRender.id)}
                    disabled={enhancing}
                    className="btn btn-sm"
                    style={{ flex: 1, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontWeight: 700 }}>
                    {enhancing ? <span className="spinner" /> : "✨ Enhance"}
                  </button>
                  <button
                    onClick={() => deleteRender(latestRender.id)}
                    disabled={deletingId === latestRender.id}
                    className="btn btn-sm"
                    title="Delete this render"
                    style={{ background: "rgba(239,68,68,.12)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)" }}>
                    {deletingId === latestRender.id ? <span className="spinner" /> : "🗑"}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                  Enhance runs an upscale + sharpen pass. A ComfyUI video-upscale flow can be plugged into the same endpoint later.
                </p>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
                No render yet. Set up the timeline and click <b>Render Final</b>.
              </div>
            )}
          </div>

          {/* History */}
          {data?.renders && data.renders.length > 1 && (
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Previous renders</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                {data.renders.slice(1).map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,.03)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: r.type === "final_video_enhanced" ? "#ec4899" : "#a78bfa", background: r.type === "final_video_enhanced" ? "rgba(236,72,153,.12)" : "rgba(167,139,250,.12)", padding: "2px 6px", borderRadius: 4 }}>
                      {r.type === "final_video_enhanced" ? "ENH" : "FIN"}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: "var(--muted)" }}>{new Date(r.created_at).toLocaleString()}</span>
                    {r.video_path && <a href={r.video_path} target="_blank" rel="noreferrer" className="btn btn-xs btn-secondary" style={{ textDecoration: "none" }}>Open</a>}
                    <button
                      onClick={() => deleteRender(r.id)}
                      disabled={deletingId === r.id}
                      className="btn btn-xs"
                      title="Delete this render"
                      style={{ background: "rgba(239,68,68,.12)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)" }}>
                      {deletingId === r.id ? <span className="spinner" /> : "🗑"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
