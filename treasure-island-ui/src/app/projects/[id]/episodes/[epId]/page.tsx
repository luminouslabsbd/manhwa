"use client";
import useSWR from "swr";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import RegenModal, { type RegenOptions } from "@/components/RegenModal";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { toast } from "@/lib/toast";
import ShotCard from "@/components/ShotCard";
import ShotEditor from "@/components/ShotEditor";
import ShotEditorNew from "@/components/ShotEditorNew";

type LightboxItem = {
  imagePath: string; genId: string; shotId: string; isApproved: boolean; model?: string;
  shotNumber?: number; storyLine?: string | null; dialogue?: string | null; anchor?: string | null;
  charName?: string | null; charRefImage?: string | null;
  videoGens?: Generation[]; ttsGens?: Generation[]; imageGens?: Generation[];
  frames?: Frame[];
  fullPrompt?: string | null;
  approvedVideoId?: string | null; approvedTtsId?: string | null; approvedImageId?: string | null;
  shotPipelineModel?: string | null;
};

const TTS_VOICES = ["default", "female_1", "female_2", "male_1", "male_2", "child"];

type VideoEffectId =
  | "none" | "fade-in" | "fade-out" | "fade-both"
  | "ken-burns" | "zoom-in" | "zoom-out"
  | "pan-left" | "pan-right" | "pan-up" | "pan-down"
  | "shake";

const VIDEO_EFFECTS: Array<{ id: VideoEffectId; label: string; emoji: string; tagline: string }> = [
  { id: "none",      label: "None",       emoji: "▫️", tagline: "Static" },
  { id: "fade-in",   label: "Fade in",    emoji: "🌅", tagline: "Up from black" },
  { id: "fade-out",  label: "Fade out",   emoji: "🌇", tagline: "Down to black" },
  { id: "fade-both", label: "Fade both",  emoji: "🕯",  tagline: "In and out" },
  { id: "ken-burns", label: "Ken Burns",  emoji: "🖼",  tagline: "Gentle zoom" },
  { id: "zoom-in",   label: "Zoom in",    emoji: "🔎", tagline: "Push in" },
  { id: "zoom-out",  label: "Zoom out",   emoji: "🔭", tagline: "Pull back" },
  { id: "pan-left",  label: "Pan left",   emoji: "⬅️", tagline: "Right → left" },
  { id: "pan-right", label: "Pan right",  emoji: "➡️", tagline: "Left → right" },
  { id: "pan-up",    label: "Pan up",     emoji: "⬆️", tagline: "Tilt upward" },
  { id: "pan-down",  label: "Pan down",   emoji: "⬇️", tagline: "Tilt downward" },
  { id: "shake",     label: "Shake",      emoji: "💥", tagline: "Handheld jitter" },
];

function Lightbox({ items, index, onClose, onPrev, onNext, onJump, onApprove, onDelete, onApproveVideo, onGenerateVideo, onRenderVideoEffect, onDeleteGen, onRegenerate, onGenerateAllModels, onUploadImage, onBulkDelete, onBulkDeleteRefresh, onGenerateImage, onGenerateTTS, onPrevShot, onNextShot, prevShotLabel, nextShotLabel }: {
  items: LightboxItem[]; index: number;
  onClose: () => void; onPrev: () => void; onNext: () => void; onJump: (i: number) => void;
  onApprove: (genId: string, shotId: string) => void;
  onDelete: (genId: string) => void;
  onApproveVideo: (genId: string, shotId: string) => void;
  onGenerateVideo: (shotId: string, preset: string) => void;
  onRenderVideoEffect: (shotId: string, effect: VideoEffectId) => Promise<void>;
  onDeleteGen: (genId: string) => void;
  onRegenerate: (shotId: string, model: string | undefined) => void;
  onGenerateAllModels: (shotId: string) => void;
  onUploadImage: (shotId: string, file: File) => Promise<void>;
  onBulkDelete: (shotId: string) => Promise<void>;
  onBulkDeleteRefresh: (deletedIds: string[]) => void;
  onGenerateImage: (shotId: string) => void;
  onGenerateTTS: (shotId: string, voice: string) => Promise<{ audio_path: string } | null>;
  onPrevShot?: () => void;
  onNextShot?: () => void;
  prevShotLabel?: string | null;
  nextShotLabel?: string | null;
}) {
  const item = items[index];
  const [activeTab, setActiveTab] = useState<"images" | "video" | "tts" | "log">("images");
  const [selectedVideoIdx, setSelectedVideoIdx] = useState(0);
  // Multi-select state for bulk delete on Images / Video tabs
  const [selectedGenIds, setSelectedGenIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  function toggleSelect(genId: string) {
    setSelectedGenIds(prev => {
      const next = new Set(prev);
      next.has(genId) ? next.delete(genId) : next.add(genId);
      return next;
    });
  }
  // Clear selection whenever the tab or shot changes
  useEffect(() => { setSelectedGenIds(new Set()); }, [activeTab, item.shotId]);
  async function deleteSelected(label: string) {
    if (!selectedGenIds.size) return;
    if (!confirm(`Delete ${selectedGenIds.size} ${label}? This cannot be undone.`)) return;
    setDeletingSelected(true);
    const ids = [...selectedGenIds];
    const results = await Promise.allSettled(ids.map(gid => fetch(`/api/generations/${gid}`, { method: "DELETE" }).then(r => r.ok ? gid : null)));
    const actuallyDeleted = results.flatMap(r => r.status === "fulfilled" && r.value ? [r.value] : []);
    setSelectedGenIds(new Set());
    setDeletingSelected(false);
    onBulkDeleteRefresh(actuallyDeleted);
  }
  const [frameFilter, setFrameFilter] = useState<string | null>(null); // null = all
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [ttsVoice, setTtsVoice] = useState("default");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [imgGenerating, setImgGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [effectsRendering, setEffectsRendering] = useState<Set<VideoEffectId>>(new Set());
  const [extraTtsGens, setExtraTtsGens] = useState<Generation[]>([]);
  useEffect(() => { setExtraTtsGens([]); setVideoGenerating(false); setEffectsRendering(new Set()); }, [item.shotId]);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  function parseGenType(type: string): { model: string | null; frameId: string | null } {
    // Formats: "image" | "image:model" | "image:model:frame:uuid" | "image:frame:uuid"
    const parts = type.split(":");
    const frameIdx = parts.indexOf("frame");
    const frameId = frameIdx >= 0 && parts[frameIdx + 1] ? parts[frameIdx + 1] : null;
    // Model parts are between index 1 and frameIdx (exclusive of "image" and "frame:uuid")
    const modelEnd = frameIdx > 0 ? frameIdx : parts.length;
    const modelParts = parts.slice(1, modelEnd);
    const model = modelParts.length > 0 ? modelParts.join(":") : null;
    return { model, frameId };
  }

  /** Map a Generation.type value for a video row to a human-readable model label + colour. */
  function formatVideoModel(type: string): { label: string; short: string; color: string } {
    if (type === "video:ltx2_distilled")                       return { label: "LTX-Video 2 Distilled", short: "LTX-2d", color: "#10b981" };
    if (type === "video:ltx2" || type.startsWith("video:ltx")) return { label: "LTX-Video 2", short: "LTX-2", color: "#8b5cf6" };
    if (type === "video:t2v_fallback")                         return { label: "Wan 2.1 T2V",  short: "Wan T2V", color: "#f59e0b" };
    if (type === "video:i2v_fallback")                         return { label: "SDXL img2img", short: "SDXL",    color: "#64748b" };
    if (type.startsWith("video:effect:"))                      return { label: `Effect: ${type.slice("video:effect:".length)}`, short: "FX", color: "#ec4899" };
    // Legacy / default — Wan 2.1 I2V 14B
    return { label: "Wan 2.1 I2V 14B", short: "Wan 2.1", color: "#0ea5e9" };
  }

  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (activeTab === "images") {
        if (e.key === "ArrowLeft") onPrev();
        if (e.key === "ArrowRight") onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, activeTab]);

  const videoGens = item.videoGens ?? [];
  const ttsGens = [...(item.ttsGens ?? []), ...extraTtsGens];
  const imageGens = item.imageGens ?? [];
  const frames = item.frames ?? [];
  const selectedVideo = videoGens[selectedVideoIdx] ?? null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.95)", zIndex: 2000, display: "flex", flexDirection: "column" }}>
      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", background: "rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0, height: 50 }}>
        {/* Shot info */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {item.shotNumber != null && <span style={{ fontSize: 12, fontWeight: 800, color: "#60a5fa", background: "rgba(96,165,250,.15)", borderRadius: 6, padding: "3px 10px" }}>S{String(item.shotNumber).padStart(2, "0")}</span>}
          {item.charName && <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>{item.charName}</span>}
          {item.isApproved && <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.12)", borderRadius: 6, padding: "3px 8px" }}>✅</span>}
          {item.shotPipelineModel && <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", background: "rgba(255,255,255,.06)", borderRadius: 4, padding: "2px 7px", fontFamily: "monospace" }}>{item.shotPipelineModel.replace(".safetensors","")}</span>}
        </div>

        {/* Centre tabs */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 2 }}>
          {(["images", "video", "tts", "log"] as const).map(tab => {
            const meta = {
              images: { icon: "🖼", label: "Images", count: items.length, activeColor: "#60a5fa" },
              video:  { icon: "🎬", label: "Video",  count: videoGens.length, activeColor: "#a78bfa" },
              tts:    { icon: "🎙", label: "TTS",    count: ttsGens.length,   activeColor: "#34d399" },
              log:    { icon: "📋", label: "Pipeline Log", count: imageGens.length + videoGens.length, activeColor: "#fb923c" },
            }[tab];
            const isActive = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "6px 14px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                borderRadius: "8px 8px 0 0", border: "none",
                background: isActive ? "rgba(255,255,255,.08)" : "transparent",
                color: isActive ? meta.activeColor : "rgba(255,255,255,.4)",
                borderBottom: isActive ? `2px solid ${meta.activeColor}` : "2px solid transparent",
                cursor: "pointer", transition: "all .15s",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {meta.icon} {meta.label}
                {meta.count > 0 && <span style={{ fontSize: 10, background: isActive ? meta.activeColor + "30" : "rgba(255,255,255,.1)", color: isActive ? meta.activeColor : "rgba(255,255,255,.5)", borderRadius: 10, padding: "1px 6px", fontWeight: 700 }}>{meta.count}</span>}
              </button>
            );
          })}
        </div>

        {/* Prev / Next shot + Close */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <button
            onClick={() => onPrevShot?.()}
            disabled={!onPrevShot}
            title={prevShotLabel ? `Previous shot — ${prevShotLabel}` : "No previous shot"}
            style={{ background: "rgba(96,165,250,.15)", border: "1px solid rgba(96,165,250,.35)", color: onPrevShot ? "#60a5fa" : "rgba(255,255,255,.25)", borderRadius: 8, padding: "0 10px", height: 34, fontSize: 12, fontWeight: 700, cursor: onPrevShot ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 4 }}>
            ◀ Shot
          </button>
          <button
            onClick={() => onNextShot?.()}
            disabled={!onNextShot}
            title={nextShotLabel ? `Next shot — ${nextShotLabel}` : "No next shot"}
            style={{ background: "rgba(96,165,250,.15)", border: "1px solid rgba(96,165,250,.35)", color: onNextShot ? "#60a5fa" : "rgba(255,255,255,.25)", borderRadius: 8, padding: "0 10px", height: 34, fontSize: 12, fontWeight: 700, cursor: onNextShot ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 4 }}>
            Shot ▶
          </button>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.08)", border: "none", color: "#fff", borderRadius: 8, width: 34, height: 34, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      </div>

      {/* ── Selection action bar (visible when one or more thumbs are selected in Images or Video tab) ── */}
      {selectedGenIds.size > 0 && (activeTab === "images" || activeTab === "video") && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", background: "rgba(239,68,68,.12)", borderBottom: "1px solid rgba(239,68,68,.3)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>
            {selectedGenIds.size} selected
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSelectedGenIds(new Set())} disabled={deletingSelected}
              style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "rgba(255,255,255,.7)", cursor: "pointer" }}>
              Clear
            </button>
            <button onClick={() => deleteSelected(activeTab === "images" ? `image${selectedGenIds.size === 1 ? "" : "s"}` : `video${selectedGenIds.size === 1 ? "" : "s"}`)} disabled={deletingSelected}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: deletingSelected ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              {deletingSelected ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : "🗑"} Delete {activeTab === "images" ? "Images" : "Videos"}
            </button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ════ IMAGES TAB ════ */}
        {activeTab === "images" && (() => {
          // Build frame-grouped index map
          type Group = { frameNum: number | null; frameDesc: string | null; entries: { it: LightboxItem; i: number }[] };
          const groupMap = new Map<string, Group>();
          items.forEach((it, i) => {
            const gen = imageGens.find(g => g.id === it.genId);
            const { frameId } = parseGenType(gen?.type ?? "");
            const frame = frameId ? frames.find(f => f.id === frameId) : null;
            const key = frameId ?? "__none__";
            if (!groupMap.has(key)) groupMap.set(key, { frameNum: frame?.frame_number ?? null, frameDesc: frame?.description ?? null, entries: [] });
            groupMap.get(key)!.entries.push({ it, i });
          });
          const groups = [...groupMap.entries()].sort(([ka, a], [kb, b]) => {
            if (ka === "__none__") return 1; if (kb === "__none__") return -1;
            return (a.frameNum ?? 0) - (b.frameNum ?? 0);
          });
          const hasFrameGroups = groups.some(([k]) => k !== "__none__");

          // Filter items by selected frame
          const visibleEntries: { it: LightboxItem; i: number }[] = frameFilter
            ? (groupMap.get(frameFilter)?.entries ?? [])
            : items.map((it, i) => ({ it, i }));

          // Remap to a local index within the filtered set
          const visibleIndex = visibleEntries.findIndex(e => e.i === index);
          const effectiveIndex = visibleIndex >= 0 ? visibleIndex : 0;
          const visibleItem = visibleEntries[effectiveIndex]?.it ?? item;

          // Current image details (use visible item)
          const curGen = imageGens.find(g => g.id === visibleItem.genId);
          const { frameId: curFrameId } = parseGenType(curGen?.type ?? "");
          const curFrame = curFrameId ? frames.find(f => f.id === curFrameId) : null;
          const curModelLabel = (curGen?.model ?? "").replace(/\.(safetensors|ckpt|pt)$/i, "") || null;

          return (
            <>
              {/* ── Filmstrip: frame-grouped (wider) ── */}
              {visibleEntries.length > 0 && (
                <div style={{ width: 156, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.08)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 0, padding: "6px 0", background: "rgba(0,0,0,.3)" }}>
                  {/* Reference image at top of filmstrip */}
                  {(item.charRefImage || item.charName) && (
                    <div style={{ padding: "0 6px 8px", borderBottom: "1px solid rgba(255,255,255,.07)", marginBottom: 6 }}>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4, paddingLeft: 2 }}>Ref Image</div>
                      <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid rgba(96,165,250,.25)", background: "rgba(0,0,0,.4)", position: "relative" }}>
                        {item.charRefImage
                          ? <img src={item.charRefImage} alt={item.charName ?? "ref"} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                          : <div style={{ width: "100%", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, background: "rgba(96,165,250,.05)" }}>👤</div>}
                        {item.charName && (
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.75)", fontSize: 9, color: "rgba(255,255,255,.8)", fontWeight: 700, textAlign: "center", padding: "3px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.charName}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {(frameFilter ? [[frameFilter, groupMap.get(frameFilter)!]] as [string, Group][] : groups).map(([key, group]) => (
                    <div key={key} style={{ marginBottom: hasFrameGroups ? 10 : 4 }}>
                      {/* Frame group header */}
                      {hasFrameGroups && (
                        <button onClick={() => setFrameFilter(frameFilter === key ? null : key)} style={{
                          width: "100%", padding: "5px 8px", display: "flex", alignItems: "center", gap: 5,
                          background: frameFilter === key ? "rgba(96,165,250,.15)" : "transparent",
                          border: "none", borderLeft: frameFilter === key ? "2px solid #60a5fa" : "2px solid transparent",
                          cursor: "pointer", textAlign: "left",
                        }}>
                          {key !== "__none__"
                            ? <span style={{ fontSize: 10, fontWeight: 800, color: frameFilter === key ? "#60a5fa" : "rgba(255,255,255,.5)", background: frameFilter === key ? "rgba(96,165,250,.2)" : "rgba(255,255,255,.08)", borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>F{group.frameNum}</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>No Frame</span>}
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            {group.frameDesc ? group.frameDesc.slice(0, 16) : `${group.entries.length} image${group.entries.length !== 1 ? "s" : ""}`}
                          </span>
                        </button>
                      )}
                      {/* Thumbnails — only show visible entries */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "3px 6px 0" }}>
                        {group.entries.map(({ it, i }) => {
                          const thumbGen = imageGens.find(g => g.id === it.genId);
                          const thumbModel = (thumbGen?.model ?? "").replace(/\.(safetensors|ckpt|pt)$/i,"").split(/[-_]/)[0].slice(0,11);
                          const isActive = i === index;
                          const isSelected = selectedGenIds.has(it.genId);
                          return (
                            <button key={it.genId} ref={el => { thumbRefs.current[i] = el; }} onClick={() => onJump(i)} style={{
                              flexShrink: 0, width: "100%", aspectRatio: "16/9", borderRadius: 5, overflow: "hidden", padding: 0, cursor: "pointer",
                              border: isSelected ? "2px solid #ef4444" : isActive ? "2px solid #60a5fa" : it.isApproved ? "2px solid #22c55e" : "2px solid rgba(255,255,255,.1)",
                              boxShadow: isSelected ? "0 0 0 2px rgba(239,68,68,.4)" : isActive ? "0 0 0 2px rgba(96,165,250,.3)" : "none",
                              opacity: isActive || isSelected ? 1 : 0.6, transition: "all .15s",
                              background: "rgba(255,255,255,.06)", position: "relative",
                            }} title={thumbGen?.model ?? `Image ${i + 1}`}>
                              <img src={it.imagePath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              {/* Selection checkbox (click stops propagation so it doesn't navigate) */}
                              <span onClick={e => { e.stopPropagation(); toggleSelect(it.genId); }}
                                style={{ position: "absolute", top: 2, left: 2, width: 16, height: 16, borderRadius: 4, background: isSelected ? "#ef4444" : "rgba(0,0,0,.65)", border: `1.5px solid ${isSelected ? "#fff" : "rgba(255,255,255,.5)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 900, cursor: "pointer" }}>
                                {isSelected ? "✓" : ""}
                              </span>
                              {it.isApproved && <div style={{ position: "absolute", top: 2, right: 2, width: 11, height: 11, background: "#22c55e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 900 }}>✓</div>}
                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.7)", fontSize: 8, color: "rgba(255,255,255,.7)", textAlign: "center", padding: "2px 2px", fontWeight: 600 }}>{thumbModel || (i + 1)}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Centre: frame filter bar + large image ── */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Frame filter pills — clicking filters the view */}
                {hasFrameGroups && (
                  <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,.07)", background: "rgba(0,0,0,.2)", overflowX: "auto" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", flexShrink: 0, fontWeight: 600 }}>Filter:</span>
                    <button onClick={() => setFrameFilter(null)} style={{
                      padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0,
                      border: !frameFilter ? "2px solid rgba(255,255,255,.5)" : "2px solid rgba(255,255,255,.15)",
                      background: !frameFilter ? "rgba(255,255,255,.1)" : "transparent",
                      color: !frameFilter ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.4)",
                      cursor: "pointer",
                    }}>All ({items.length})</button>
                    {groups.filter(([k]) => k !== "__none__").map(([key, group]) => {
                      const isActive = frameFilter === key;
                      return (
                        <button key={key} onClick={() => { setFrameFilter(isActive ? null : key); if (!isActive) onJump(group.entries[0].i); }} style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0,
                          border: isActive ? "2px solid #60a5fa" : "2px solid rgba(96,165,250,.2)",
                          background: isActive ? "rgba(96,165,250,.15)" : "transparent",
                          color: isActive ? "#60a5fa" : "rgba(255,255,255,.4)",
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        }} title={group.frameDesc ?? ""}>
                          <span style={{ fontWeight: 800 }}>F{group.frameNum}</span>
                          {group.frameDesc && <span style={{ fontWeight: 400, opacity: .7 }}>{group.frameDesc.slice(0, 16)}</span>}
                          <span style={{ opacity: .5 }}>({group.entries.length})</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Large image */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 8px", overflow: "hidden", position: "relative" }}>
                  {visibleItem.imagePath ? (
                    <img src={visibleItem.imagePath} alt="full size" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 0 40px rgba(0,0,0,.7)" }} />
                  ) : (
                    <div style={{ textAlign: "center", color: "rgba(255,255,255,.3)" }}>
                      <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No images yet</div>
                      <div style={{ fontSize: 13 }}>Use the buttons on the right to generate images</div>
                    </div>
                  )}
                  {visibleEntries.length > 1 && <button onClick={() => { const prev = visibleEntries[(effectiveIndex - 1 + visibleEntries.length) % visibleEntries.length]; onJump(prev.i); }} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", border: "none", color: "#fff", borderRadius: 8, width: 38, height: 56, fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
                  {visibleEntries.length > 1 && <button onClick={() => { const next = visibleEntries[(effectiveIndex + 1) % visibleEntries.length]; onJump(next.i); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", border: "none", color: "#fff", borderRadius: 8, width: 38, height: 56, fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
                </div>
              </div>

              {/* ── Right panel ── */}
              <div style={{ width: 256, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", background: "rgba(255,255,255,.02)" }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 0" }}>

                  {/* Model + counter row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    {curModelLabel && (
                      <span style={{ fontSize: 10, color: "#fb923c", background: "rgba(251,146,60,.1)", borderRadius: 4, padding: "2px 7px", fontFamily: "monospace", fontWeight: 700 }}>{curModelLabel}</span>
                    )}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", marginLeft: "auto" }}>{effectiveIndex + 1} / {visibleEntries.length}{frameFilter ? ` (F${groupMap.get(frameFilter)?.frameNum})` : ""}</span>
                  </div>

                  {/* Frame info box */}
                  {curFrame && (
                    <div style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(96,165,250,.08)", borderRadius: 7, border: "1px solid rgba(96,165,250,.2)" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ background: "rgba(96,165,250,.2)", borderRadius: 3, padding: "1px 5px" }}>Frame {curFrame.frame_number}</span>
                        {curFrame.ai_suggested && <span style={{ fontSize: 9, color: "rgba(96,165,250,.7)" }}>AI</span>}
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,.75)", margin: 0, lineHeight: 1.4 }}>{curFrame.description}</p>
                    </div>
                  )}

                  {/* Frame Prompt (what was actually sent) */}
                  {curFrame && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(251,146,60,.7)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Frame Prompt</div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.5, background: "rgba(251,146,60,.06)", borderRadius: 6, padding: "8px 10px", borderLeft: "2px solid rgba(251,146,60,.4)" }}>
                        {curFrame.prompt?.trim() || curFrame.description}
                      </p>
                    </div>
                  )}

                  {/* Original full prompt */}
                  {item.fullPrompt && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Original Prompt</div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,.45)", margin: 0, lineHeight: 1.5, background: "rgba(255,255,255,.04)", borderRadius: 6, padding: "8px 10px", borderLeft: "2px solid rgba(255,255,255,.1)" }}>
                        {item.fullPrompt}
                      </p>
                    </div>
                  )}

                  {/* Character ref (compact) */}
                  {(item.charRefImage || item.charName) && (
                    <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "rgba(255,255,255,.04)", borderRadius: 7, border: "1px solid rgba(255,255,255,.08)" }}>
                      {item.charRefImage
                        ? <img src={item.charRefImage} alt={item.charName ?? ""} style={{ width: 36, height: 36, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                        : <div style={{ width: 36, height: 36, borderRadius: 5, background: "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>👤</div>}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{item.charName}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)" }}>reference image</div>
                      </div>
                    </div>
                  )}

                  {item.storyLine && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Story</div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,.65)", lineHeight: 1.5, margin: 0, background: "rgba(255,255,255,.04)", borderRadius: 6, padding: "8px 10px", borderLeft: "2px solid rgba(96,165,250,.3)" }}>{item.storyLine}</p>
                    </div>
                  )}
                  {item.dialogue && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(253,230,138,.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Dialogue</div>
                      <p style={{ fontSize: 11, color: "#fde68a", lineHeight: 1.5, margin: 0, background: "rgba(253,230,138,.05)", borderRadius: 6, padding: "8px 10px", borderLeft: "2px solid rgba(253,230,138,.35)", fontStyle: "italic" }}>"{item.dialogue}"</p>
                    </div>
                  )}
                  {item.anchor && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Action</div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,.45)", lineHeight: 1.4, margin: 0 }}>{item.anchor}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 7, borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
                  {visibleItem.imagePath && (
                    <button onClick={() => onApprove(visibleItem.genId, visibleItem.shotId)} style={{ width: "100%", padding: "9px 0", fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: "pointer", background: visibleItem.isApproved ? "#22c55e" : "rgba(34,197,94,.12)", color: visibleItem.isApproved ? "#fff" : "#22c55e", border: visibleItem.isApproved ? "2px solid #22c55e" : "2px solid rgba(34,197,94,.4)", transition: "all .15s" }}>
                      {visibleItem.isApproved ? "✅ Approved" : "✅ Approve Image"}
                    </button>
                  )}
                  <button
                    disabled={imgGenerating}
                    onClick={() => { setImgGenerating(true); onGenerateImage(item.shotId); setTimeout(() => setImgGenerating(false), 4000); }}
                    style={{ width: "100%", padding: "9px 0", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "2px solid rgba(233,69,96,.5)", background: imgGenerating ? "rgba(233,69,96,.06)" : "rgba(233,69,96,.12)", color: imgGenerating ? "rgba(233,69,96,.5)" : "#e94560", cursor: imgGenerating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {imgGenerating ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Queuing…</> : "⚡ Generate Image"}
                  </button>
                  <button onClick={() => onGenerateAllModels(item.shotId)} style={{ width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "2px solid rgba(96,165,250,.4)", background: "rgba(96,165,250,.08)", color: "#60a5fa", cursor: "pointer" }}>
                    ⚡ Generate — All Models
                  </button>
                  {curModelLabel && (
                    <button onClick={() => onRegenerate(item.shotId, curGen?.model ?? undefined)} style={{ width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "2px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.08)", color: "#f59e0b", cursor: "pointer" }}>
                      🔄 Regen ({curModelLabel.split(/[-_]/)[0].slice(0,12)})
                    </button>
                  )}
                  <input ref={uploadRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={async e => { const f = e.target.files?.[0]; if (f) { await onUploadImage(item.shotId, f); e.target.value = ""; } }} />
                  <button onClick={() => uploadRef.current?.click()} style={{ width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "2px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.08)", color: "#a78bfa", cursor: "pointer" }}>
                    📁 Upload Image / Video
                  </button>
                  {visibleItem.imagePath && (
                    <button onClick={() => { if (confirm("Delete this image?")) { onDelete(visibleItem.genId); } }} style={{ width: "100%", padding: "8px 0", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "2px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.06)", color: "#f87171", cursor: "pointer" }}>
                      🗑 Delete Image
                    </button>
                  )}
                  <button onClick={async () => { if (confirm(`Delete ALL images, videos and pipeline logs for Shot ${item.shotNumber != null ? `S${String(item.shotNumber).padStart(2,"0")}` : ""}? This cannot be undone.`)) { await onBulkDelete(item.shotId); onClose(); } }} style={{ width: "100%", padding: "8px 0", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "2px solid rgba(239,68,68,.5)", background: "rgba(239,68,68,.1)", color: "#ef4444", cursor: "pointer" }}>
                    🗑 Delete All (Reset Shot)
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* ════ VIDEO TAB ════ */}
        {activeTab === "video" && (
          <>
            {/* Left: video list */}
            <div style={{ width: 150, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.08)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "8px 6px", background: "rgba(0,0,0,.3)" }}>
              {videoGens.length === 0
                ? <div style={{ padding: "16px 8px", textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 11 }}>No videos yet</div>
                : videoGens.map((g, i) => {
                  const isSel = i === selectedVideoIdx;
                  const isApproved = g.id === item.approvedVideoId;
                  const isRunning = g.status === "running" || g.status === "video_generating";
                  const isFailed = g.status === "failed";
                  const isSelected = selectedGenIds.has(g.id);
                  const modelInfo = formatVideoModel(g.type);
                  return (
                    <button key={g.id} onClick={() => setSelectedVideoIdx(i)} title={isFailed ? (g.error ?? "Generation failed") : `${modelInfo.label} · V${i + 1}`} style={{
                      flexShrink: 0, width: "100%", aspectRatio: "16/9", borderRadius: 6, overflow: "hidden", padding: 0, cursor: "pointer",
                      border: isSelected ? "2px solid #ef4444" : isSel ? "2px solid #a78bfa" : isApproved ? "2px solid #7c3aed" : isFailed ? "2px solid rgba(239,68,68,.55)" : "2px solid rgba(255,255,255,.1)",
                      boxShadow: isSelected ? "0 0 0 2px rgba(239,68,68,.4)" : isSel ? "0 0 0 2px rgba(167,139,250,.3)" : "none",
                      opacity: isSel || isSelected ? 1 : 0.55, transition: "all .15s", background: "#000", position: "relative",
                    }}>
                      {isRunning
                        ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(124,58,237,.15)" }}><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: "#7c3aed transparent transparent transparent" }} /></div>
                        : g.video_path
                          ? <video src={g.video_path} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} muted />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontSize: 16, background: isFailed ? "rgba(239,68,68,.12)" : "transparent" }}>{isFailed ? "⚠" : "✗"}</div>}
                      {/* Selection checkbox */}
                      <span onClick={e => { e.stopPropagation(); toggleSelect(g.id); }}
                        style={{ position: "absolute", bottom: 16, left: 3, width: 16, height: 16, borderRadius: 4, background: isSelected ? "#ef4444" : "rgba(0,0,0,.65)", border: `1.5px solid ${isSelected ? "#fff" : "rgba(255,255,255,.5)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 900, cursor: "pointer" }}>
                        {isSelected ? "✓" : ""}
                      </span>
                      {isApproved && <div style={{ position: "absolute", top: 2, right: 2, fontSize: 9, background: "#7c3aed", color: "#fff", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>✓</div>}
                      {!isRunning && !isFailed && (
                        <div style={{ position: "absolute", top: 2, left: 2, fontSize: 8, background: modelInfo.color, color: "#fff", borderRadius: 3, padding: "1px 4px", fontWeight: 700, letterSpacing: .3 }}>{modelInfo.short}</div>
                      )}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: isFailed ? "rgba(127,29,29,.85)" : "rgba(0,0,0,.65)", fontSize: 9, color: isFailed ? "#fecaca" : "rgba(255,255,255,.7)", textAlign: "center", padding: "2px 0", fontWeight: 600 }}>{isRunning ? "⏳" : isFailed ? "Failed" : g.type.startsWith("video:effect:") ? g.type.slice("video:effect:".length) : `V${i + 1}`}</div>
                    </button>
                  );
                })}
            </div>

            {/* Centre: large video player */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px", overflow: "hidden", background: "#000" }}>
              {videoGens.length === 0 ? (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,.3)" }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>🎬</div>
                  <div style={{ fontSize: 14 }}>No videos yet</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Approve an image first, then generate video</div>
                </div>
              ) : selectedVideo ? (
                (selectedVideo.status === "running" || selectedVideo.status === "video_generating") ? (
                  <div style={{ textAlign: "center", color: "#a78bfa" }}>
                    <span className="spinner" style={{ width: 44, height: 44, borderWidth: 3, borderColor: "#a78bfa transparent transparent transparent", display: "block", margin: "0 auto 16px" }} />
                    <div style={{ fontSize: 14 }}>Rendering video...</div>
                  </div>
                ) : selectedVideo.video_path ? (
                  <video key={selectedVideo.id} src={selectedVideo.video_path} style={{ maxHeight: "100%", maxWidth: "100%", borderRadius: 10, boxShadow: "0 0 60px rgba(0,0,0,.9)" }} controls loop autoPlay muted />
                ) : (
                  <div style={{ textAlign: "center", maxWidth: 520, padding: "0 24px" }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>⚠</div>
                    <div style={{ color: "#f87171", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Generation failed</div>
                    {selectedVideo.error && (
                      <pre style={{ fontSize: 11, color: "rgba(255,255,255,.7)", background: "rgba(127,29,29,.25)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "10px 12px", textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{selectedVideo.error}</pre>
                    )}
                  </div>
                )
              ) : null}
            </div>

            {/* Right: story + actions */}
            <div style={{ width: 240, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", background: "rgba(255,255,255,.02)" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
                {selectedVideo && (() => {
                  const mi = formatVideoModel(selectedVideo.type);
                  return (
                    <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(167,139,250,.08)", borderRadius: 8, border: "1px solid rgba(167,139,250,.2)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa" }}>V{selectedVideoIdx + 1} of {videoGens.length}</div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: mi.color, borderRadius: 4, padding: "2px 7px", letterSpacing: .3 }}>{mi.label}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", fontFamily: "monospace" }}>{selectedVideo.type}</div>
                      {selectedVideo.id === item.approvedVideoId && <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginTop: 6 }}>📹 Final video</div>}
                    </div>
                  );
                })()}
                {item.storyLine && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Story</div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.6, margin: 0, background: "rgba(255,255,255,.05)", borderRadius: 7, padding: "10px 12px", borderLeft: "3px solid rgba(96,165,250,.5)" }}>{item.storyLine}</p>
                  </div>
                )}
                {item.dialogue && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Dialogue</div>
                    <p style={{ fontSize: 12, color: "#fde68a", lineHeight: 1.6, margin: 0, background: "rgba(253,230,138,.06)", borderRadius: 7, padding: "10px 12px", borderLeft: "3px solid rgba(253,230,138,.4)", fontStyle: "italic" }}>"{item.dialogue}"</p>
                  </div>
                )}
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0, maxHeight: "60vh", overflowY: "auto" }}>
                <button
                  disabled={!item.approvedImageId || videoGenerating}
                  onClick={async () => {
                    setVideoGenerating(true);
                    await onGenerateVideo(item.shotId, "");
                    setVideoGenerating(false);
                  }}
                  style={{ width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 700, borderRadius: 9, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: !item.approvedImageId ? "rgba(255,255,255,.08)" : videoGenerating ? "rgba(124,58,237,.5)" : "#7c3aed", color: !item.approvedImageId ? "rgba(255,255,255,.3)" : "#fff", cursor: !item.approvedImageId || videoGenerating ? "not-allowed" : "pointer", transition: "background .2s" }}>
                  {videoGenerating
                    ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: "#fff transparent transparent transparent" }} /> Queuing render…</>
                    : !item.approvedImageId ? "Approve image first" : item.approvedVideoId ? "🎬 Regenerate Video" : "🎬 Generate Video"}
                </button>

                {/* ── Self-hosted motion effects ── */}
                <div style={{ marginTop: 4, padding: "8px 2px 2px", borderTop: "1px dashed rgba(255,255,255,.08)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>✨ Motion Effects</span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,.25)", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(self-hosted)</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 5 }}>
                    {VIDEO_EFFECTS.map((fx) => {
                      const rendering = effectsRendering.has(fx.id);
                      const disabled = !item.approvedImageId || rendering;
                      return (
                        <button
                          key={fx.id}
                          disabled={disabled}
                          title={!item.approvedImageId ? "Approve image first" : `${fx.label} — ${fx.tagline}`}
                          onClick={async () => {
                            setEffectsRendering((s) => { const n = new Set(s); n.add(fx.id); return n; });
                            try { await onRenderVideoEffect(item.shotId, fx.id); }
                            finally { setEffectsRendering((s) => { const n = new Set(s); n.delete(fx.id); return n; }); }
                          }}
                          style={{
                            padding: "6px 4px", borderRadius: 6, fontSize: 10, fontWeight: 600, textAlign: "left",
                            border: "1px solid rgba(167,139,250,.25)",
                            background: disabled ? "rgba(255,255,255,.04)" : rendering ? "rgba(167,139,250,.18)" : "rgba(167,139,250,.08)",
                            color: !item.approvedImageId ? "rgba(255,255,255,.3)" : rendering ? "#c4b5fd" : "#d8d4ff",
                            cursor: disabled ? "not-allowed" : "pointer",
                            display: "flex", flexDirection: "column", gap: 2, minHeight: 40,
                          }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {rendering
                              ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2, borderColor: "#c4b5fd transparent transparent transparent" }} />
                              : <span style={{ fontSize: 12 }}>{fx.emoji}</span>}
                            <span style={{ fontWeight: 700, fontSize: 10 }}>{fx.label}</span>
                          </span>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,.4)", fontWeight: 500 }}>{fx.tagline}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedVideo && selectedVideo.video_path && selectedVideo.status !== "running" && (
                  <button onClick={() => onApproveVideo(selectedVideo.id, item.shotId)} style={{ width: "100%", padding: "9px 0", fontSize: 12, fontWeight: 700, borderRadius: 9, border: "none", background: selectedVideo.id === item.approvedVideoId ? "#7c3aed" : "rgba(124,58,237,.15)", color: selectedVideo.id === item.approvedVideoId ? "#fff" : "#a78bfa", cursor: "pointer" }}>
                    {selectedVideo.id === item.approvedVideoId ? "📹 Final Video" : "Set as Final"}
                  </button>
                )}
                {selectedVideo && selectedVideo.status !== "running" && selectedVideo.status !== "video_generating" && (
                  <button onClick={() => { if (confirm(selectedVideo.status === "failed" ? "Remove this failed generation?" : "Delete this video?")) onDeleteGen(selectedVideo.id); }} style={{ width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 9, border: "2px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.06)", color: "#f87171", cursor: "pointer" }}>
                    {selectedVideo.status === "failed" ? "🗑 Remove Failed" : "🗑 Delete Video"}
                  </button>
                )}
                <input id={`vid-upload-${item.shotId}`} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return; e.target.value = "";
                  await onUploadImage(item.shotId, f);
                }} />
                <button onClick={() => (document.getElementById(`vid-upload-${item.shotId}`) as HTMLInputElement)?.click()} style={{ width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 9, border: "2px dashed rgba(255,255,255,.2)", background: "transparent", color: "rgba(255,255,255,.5)", cursor: "pointer" }}>
                  📁 Upload Clip / Image
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ PIPELINE LOG TAB ════ */}
        {activeTab === "log" && (() => {
          // Merge image + video gens, newest-first by created_at
          const allGens = [...imageGens, ...videoGens].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          // Build frame groups for log filter (from both image and video gens)
          const logFrameKeys = new Map<string, { frameNum: number; frameDesc: string }>();
          allGens.forEach(gen => {
            const { frameId } = parseGenType(gen.type);
            if (frameId && !logFrameKeys.has(frameId)) {
              const f = frames.find(fr => fr.id === frameId);
              if (f) logFrameKeys.set(frameId, { frameNum: f.frame_number, frameDesc: f.description });
            }
          });
          const logFrameList = [...logFrameKeys.entries()].sort((a, b) => a[1].frameNum - b[1].frameNum);
          const filteredGens = frameFilter
            ? allGens.filter(gen => { const { frameId } = parseGenType(gen.type); return frameId === frameFilter; })
            : allGens;

          return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Frame filter bar */}
            {logFrameList.length > 0 && (
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderBottom: "1px solid rgba(255,255,255,.07)", background: "rgba(0,0,0,.2)", overflowX: "auto" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", flexShrink: 0, fontWeight: 600 }}>Frame:</span>
                <button onClick={() => setFrameFilter(null)} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0, border: !frameFilter ? "2px solid rgba(255,255,255,.5)" : "2px solid rgba(255,255,255,.15)", background: !frameFilter ? "rgba(255,255,255,.1)" : "transparent", color: !frameFilter ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.4)", cursor: "pointer" }}>All ({allGens.length})</button>
                {logFrameList.map(([fid, { frameNum, frameDesc }]) => {
                  const cnt = allGens.filter(g => { const { frameId } = parseGenType(g.type); return frameId === fid; }).length;
                  const isActive = frameFilter === fid;
                  return (
                    <button key={fid} onClick={() => setFrameFilter(isActive ? null : fid)} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0, border: isActive ? "2px solid #60a5fa" : "2px solid rgba(96,165,250,.2)", background: isActive ? "rgba(96,165,250,.15)" : "transparent", color: isActive ? "#60a5fa" : "rgba(255,255,255,.4)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontWeight: 800 }}>F{frameNum}</span>
                      <span style={{ opacity: .7 }}>{frameDesc.slice(0, 14)}</span>
                      <span style={{ opacity: .5 }}>({cnt})</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Header summary */}
            <div style={{ display: "flex", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
              <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(251,146,60,.08)", border: "1px solid rgba(251,146,60,.25)", fontSize: 12 }}>
                <span style={{ color: "#fb923c", fontWeight: 700 }}>📋 Generation Pipeline</span>
                <span style={{ color: "rgba(255,255,255,.5)", marginLeft: 8 }}>Shot {item.shotNumber != null ? `S${String(item.shotNumber).padStart(2,"0")}` : ""}</span>
                {frameFilter && <span style={{ color: "#60a5fa", marginLeft: 8, fontWeight: 700 }}>· F{logFrameKeys.get(frameFilter)?.frameNum}</span>}
              </div>
              {item.charName && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.15)" }}>
                  {item.charRefImage && <img src={item.charRefImage} alt="ref" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa" }}>Character</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{item.charName} <span style={{ color: "rgba(255,255,255,.25)" }}>(current ref shown)</span></div>
                  </div>
                </div>
              )}
              {item.shotPipelineModel && (
                <div style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", fontSize: 11, color: "rgba(255,255,255,.5)", display: "flex", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,.3)", marginRight: 6 }}>Default model:</span>
                  <span style={{ color: "rgba(255,255,255,.75)", fontFamily: "monospace", fontSize: 10 }}>{item.shotPipelineModel.replace(".safetensors","")}</span>
                </div>
              )}
            </div>

            {filteredGens.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,.3)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14 }}>{allGens.length === 0 ? "No generations yet" : "No entries for this frame"}</div>
                {allGens.length === 0 && <div style={{ fontSize: 12, marginTop: 6 }}>Click ⚡ Generate to start the pipeline</div>}
              </div>
            ) : filteredGens.map((gen, i) => {
              const { frameId } = parseGenType(gen.type);
              const frame = frameId ? frames.find(f => f.id === frameId) : null;
              const isVideo = gen.type === "video" || gen.type.startsWith("video:");
              const isRunning = gen.status === "running";
              const isFailed = gen.status === "failed";
              const statusColor = isRunning ? "#60a5fa" : isFailed ? "#f87171" : "#4ade80";
              const statusIcon = isRunning ? "⏳" : isFailed ? "✗" : "✓";
              const typeBadgeColor = isVideo ? "#a78bfa" : "#fb923c";
              const displayModel = (gen.model ?? "").replace(/\.(safetensors|ckpt|pt)$/i, "") || item.shotPipelineModel?.replace(/\.(safetensors|ckpt|pt)$/i, "") || "Unknown";
              return (
                <div key={gen.id} style={{ borderRadius: 10, padding: "12px 14px", border: `1px solid ${statusColor}30`, background: `${statusColor}08`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {/* Thumbnail */}
                  <div style={{ flexShrink: 0, width: 72, height: 48, borderRadius: 6, overflow: "hidden", background: "rgba(0,0,0,.4)", border: `1px solid ${statusColor}40`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    {isVideo && gen.video_path
                      ? <>
                          <video src={gen.video_path} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <span style={{ position: "absolute", bottom: 2, right: 2, fontSize: 10, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 3, padding: "0 4px" }}>▶</span>
                        </>
                      : gen.image_path
                        ? <img src={gen.image_path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : isRunning
                          ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: `${statusColor} transparent transparent transparent` }} />
                          : <span style={{ fontSize: 18, opacity: .4 }}>{isFailed ? "✗" : isVideo ? "🎬" : "🖼"}</span>}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: statusColor, background: `${statusColor}20`, borderRadius: 4, padding: "2px 7px" }}>{statusIcon} {isRunning ? "Running" : isFailed ? "Failed" : "Done"}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: typeBadgeColor, background: `${typeBadgeColor}20`, borderRadius: 4, padding: "2px 7px" }}>{isVideo ? "🎬 Video" : "🖼 Image"}</span>
                      {frame && <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,.15)", borderRadius: 4, padding: "2px 7px" }}>Frame {frame.frame_number}</span>}
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginLeft: "auto" }}>#{i + 1}</span>
                    </div>

                    {/* Model row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>Model</span>
                      <span style={{ fontSize: 11, color: "#fb923c", fontFamily: "monospace", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayModel}</span>
                    </div>

                    {/* Reference image row — use the ref stored at generation time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>Ref Used</span>
                      {gen.ref_image
                        ? <img src={gen.ref_image} alt="ref" style={{ width: 22, height: 22, borderRadius: 3, objectFit: "cover", border: "1px solid rgba(96,165,250,.4)", flexShrink: 0 }} />
                        : null}
                      {gen.ref_image
                        ? <span style={{ fontSize: 10, color: "#60a5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.charName ?? gen.ref_image.split("/").pop()}</span>
                        : <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>None (text-to-image)</span>}
                    </div>

                    {/* Error row — only for failed */}
                    {isFailed && gen.error && (
                      <div style={{ marginBottom: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)" }}>
                        <span style={{ fontSize: 9, color: "#f87171", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, display: "block", marginBottom: 2 }}>Error</span>
                        <span style={{ fontSize: 10, color: "#fca5a5", lineHeight: 1.4, wordBreak: "break-word" }}>{gen.error}</span>
                      </div>
                    )}

                    {/* Prompt row */}
                    {!isFailed && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Prompt</span>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,.55)", margin: "2px 0 0", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                        {frame ? (frame.prompt?.trim() || frame.description) : item.fullPrompt ?? "—"}
                      </p>
                    </div>
                    )}

                    {/* Footer meta */}
                    <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                      {gen.seed != null && (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)" }}>Seed: <span style={{ color: "rgba(255,255,255,.55)", fontFamily: "monospace" }}>{gen.seed}</span></span>
                      )}
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,.25)" }}>{new Date(gen.created_at).toLocaleTimeString()}</span>
                      {gen.completed_at && (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,.25)" }}>→ {new Date(gen.completed_at).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          );
        })()}

        {/* ════ TTS TAB ════ */}
        {activeTab === "tts" && (
          <>
            {/* Main: audio card list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {ttsGens.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,.3)" }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>🎙</div>
                  <div style={{ fontSize: 14 }}>No TTS audio yet</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Use the <strong style={{ color: "rgba(255,255,255,.5)" }}>🎙🎬 TTS + Videos</strong> toolbar button to generate audio</div>
                </div>
              ) : ttsGens.map((g, i) => {
                const isFinal = g.id === item.approvedTtsId;
                const voiceLabel = g.voice ?? "default";
                const isRunning = g.status === "running";
                return (
                  <div key={g.id} style={{ borderRadius: 12, padding: "14px 16px", border: `2px solid ${isFinal ? "#22c55e" : "rgba(255,255,255,.1)"}`, background: isFinal ? "rgba(34,197,94,.06)" : "rgba(255,255,255,.03)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>🎙</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)" }}>{voiceLabel}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Take {i + 1} · {new Date(g.created_at).toLocaleDateString()}</div>
                        </div>
                        {isFinal && <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.15)", borderRadius: 6, padding: "2px 8px" }}>✓ Final</span>}
                      </div>
                      <button onClick={() => { if (confirm("Delete this audio?")) onDeleteGen(g.id); }} style={{ background: "transparent", border: "1px solid rgba(239,68,68,.3)", color: "#f87171", borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer" }}>🗑</button>
                    </div>
                    {isRunning
                      ? <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#34d399", fontSize: 12 }}><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating audio...</div>
                      : g.audio_path
                        ? <audio controls src={g.audio_path} style={{ width: "100%" }} />
                        : <div style={{ fontSize: 11, color: "#f87171" }}>Generation failed</div>}
                    {g.audio_path && (
                      <button onClick={() => onApprove(g.id, item.shotId)} style={{ width: "100%", padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: isFinal ? "#22c55e" : "rgba(34,197,94,.15)", color: isFinal ? "#fff" : "#4ade80", cursor: "pointer" }}>
                        {isFinal ? "✓ Final" : "Set as Final"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right: dialogue context */}
            <div style={{ width: 240, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", background: "rgba(255,255,255,.02)" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Dialogue</div>
                {item.dialogue
                  ? <p style={{ fontSize: 13, color: "#fde68a", lineHeight: 1.7, margin: "0 0 14px", background: "rgba(253,230,138,.06)", borderRadius: 8, padding: "12px 14px", borderLeft: "3px solid rgba(253,230,138,.5)", fontStyle: "italic" }}>"{item.dialogue}"</p>
                  : <p style={{ fontSize: 12, color: "rgba(255,255,255,.25)", margin: "0 0 14px" }}>No dialogue for this shot.</p>}
                {item.storyLine && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Story</div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,.65)", lineHeight: 1.6, margin: 0, background: "rgba(255,255,255,.04)", borderRadius: 7, padding: "10px 12px", borderLeft: "3px solid rgba(255,255,255,.12)" }}>{item.storyLine}</p>
                  </div>
                )}
                {item.charName && (
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(96,165,250,.07)", borderRadius: 8, border: "1px solid rgba(96,165,250,.15)" }}>
                    {item.charRefImage
                      ? <img src={item.charRefImage} alt={item.charName} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(96,165,250,.35)" }} />
                      : <span style={{ fontSize: 24 }}>👤</span>}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.8)" }}>{item.charName}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>speaking character</div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(52,211,153,.7)", letterSpacing: "0.5px", textTransform: "uppercase" }}>Voice</div>
                <select
                  value={ttsVoice}
                  onChange={e => setTtsVoice(e.target.value)}
                  style={{ width: "100%", background: "rgba(0,0,0,.4)", border: "1px solid rgba(52,211,153,.3)", color: "var(--text)", borderRadius: 7, padding: "7px 10px", fontSize: 12 }}
                >
                  {TTS_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <button
                  disabled={ttsLoading || !(item.dialogue?.trim() || item.storyLine?.trim())}
                  onClick={async () => {
                    if (!(item.dialogue?.trim() || item.storyLine?.trim())) return;
                    setTtsLoading(true);
                    const result = await onGenerateTTS(item.shotId, ttsVoice);
                    if (result) {
                      const newGen: Generation = { id: `tmp-${Date.now()}`, type: "tts", status: "completed", audio_path: result.audio_path, voice: ttsVoice, image_path: null, video_path: null, created_at: new Date().toISOString() };
                      setExtraTtsGens(prev => [...prev, newGen]);
                    }
                    setTtsLoading(false);
                  }}
                  style={{ width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: ttsLoading || !(item.dialogue?.trim() || item.storyLine?.trim()) ? "rgba(52,211,153,.12)" : "#34d399", color: ttsLoading || !(item.dialogue?.trim() || item.storyLine?.trim()) ? "rgba(52,211,153,.4)" : "#000", cursor: ttsLoading || !(item.dialogue?.trim() || item.storyLine?.trim()) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  {ttsLoading ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderColor: "#34d399 transparent transparent transparent" }} /> Generating…</> : !(item.dialogue?.trim() || item.storyLine?.trim()) ? "🎙 No text" : "🎙 Generate TTS"}
                </button>
                {!(item.dialogue?.trim() || item.storyLine?.trim()) && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", textAlign: "center" }}>Add dialogue or story line in the shot editor</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Frame Manager Modal ──
type FMFrame = { id: string; frame_number: number; description: string; needed: boolean; image_path: string | null; video_path: string | null; status: string; ai_suggested: boolean; };

function FrameManager({ shotId, onClose, onMutate }: { shotId: string; onClose: () => void; onMutate: () => void }) {
  const [frames, setFrames] = useState<FMFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [genLoading, setGenLoading] = useState<string | null>(null);
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function loadFrames() {
    setLoading(true);
    const r = await fetch(`/api/shots/${shotId}/frames`);
    setFrames(await r.json());
    setLoading(false);
  }

  useEffect(() => { loadFrames(); }, [shotId]);

  async function addFrame() {
    await fetch(`/api/shots/${shotId}/frames`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: "New frame" }) });
    loadFrames(); onMutate();
  }

  async function suggestFrames() {
    setAiLoading(true);
    await fetch(`/api/shots/${shotId}/frames/ai-suggest`, { method: "POST" });
    await loadFrames(); onMutate();
    setAiLoading(false);
  }

  async function toggleNeeded(frameId: string, needed: boolean) {
    await fetch(`/api/frames/${frameId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ needed }) });
    setFrames(f => f.map(fr => fr.id === frameId ? { ...fr, needed } : fr));
    onMutate();
  }

  async function deleteFrame(frameId: string) {
    await fetch(`/api/frames/${frameId}`, { method: "DELETE" });
    setFrames(f => f.filter(fr => fr.id !== frameId));
    onMutate();
  }

  async function generateFrame(frameId: string) {
    setGenLoading(frameId);
    await fetch(`/api/frames/${frameId}/generate`, { method: "POST" });
    await loadFrames(); onMutate();
    setGenLoading(null);
  }

  async function bulkGenerate() {
    const needed = frames.filter(f => f.needed);
    for (const f of needed) {
      if (f.status !== "generating") await fetch(`/api/frames/${f.id}/generate`, { method: "POST" });
    }
    await loadFrames(); onMutate();
  }

  async function handleUpload(frameId: string, file: File) {
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/frames/${frameId}/upload`, { method: "POST", body: fd });
    await loadFrames(); onMutate();
  }

  async function updateDesc(frameId: string, description: string) {
    await fetch(`/api/frames/${frameId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 3500, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, width: 640, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.7)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>🎞 Frame Manager</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Add, arrange, and generate frames for this shot</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={suggestFrames} disabled={aiLoading} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(96,165,250,.4)", background: "rgba(96,165,250,.08)", color: "#60a5fa", cursor: "pointer", fontWeight: 700 }}>
              {aiLoading ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : "🤖 AI Auto-Suggest"}
            </button>
            <button onClick={bulkGenerate} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(233,69,96,.4)", background: "rgba(233,69,96,.08)", color: "var(--accent)", cursor: "pointer", fontWeight: 700 }}>
              ⚡ Gen All Needed
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, cursor: "pointer" }}>×</button>
          </div>
        </div>

        {/* Frame list */}
        <div className="panel-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading
            ? <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}><span className="spinner" /></div>
            : frames.length === 0
              ? <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🎞</div>
                  <div>No frames yet. Use AI Auto-Suggest or add manually.</div>
                </div>
              : frames.map(f => (
                <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 9, background: f.needed ? "rgba(96,165,250,.05)" : "rgba(255,255,255,.02)", border: `1px solid ${f.needed ? "rgba(96,165,250,.2)" : "rgba(255,255,255,.07)"}` }}>
                  {/* Frame thumbnail */}
                  <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 7, overflow: "hidden", background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.1)", position: "relative" }}>
                    {f.image_path
                      ? <img src={f.image_path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : f.video_path
                        ? <video src={f.video_path} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                        : f.status === "generating"
                          ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                          : <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 11, color: "rgba(255,255,255,.3)", fontWeight: 700 }}>F{f.frame_number}</span>}
                    {f.ai_suggested && <span style={{ position: "absolute", top: 2, left: 2, fontSize: 7, background: "rgba(96,165,250,.8)", borderRadius: 3, padding: "1px 3px", color: "#fff", fontWeight: 700 }}>AI</span>}
                  </div>
                  {/* Frame info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", flexShrink: 0 }}>F{f.frame_number}</span>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: f.needed ? "#4ade80" : "var(--muted)" }}>
                        <input type="checkbox" checked={f.needed} onChange={e => toggleNeeded(f.id, e.target.checked)} style={{ accentColor: "#4ade80" }} />
                        {f.needed ? "Needed" : "Skip"}
                      </label>
                    </div>
                    <input
                      defaultValue={f.description}
                      onBlur={e => updateDesc(f.id, e.target.value)}
                      style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 5, color: "var(--text)", fontSize: 11, padding: "4px 8px" }}
                    />
                    <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                      <button onClick={() => generateFrame(f.id)} disabled={genLoading === f.id} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(233,69,96,.4)", background: "rgba(233,69,96,.08)", color: "var(--accent)", cursor: "pointer", fontWeight: 700 }}>
                        {genLoading === f.id ? <span className="spinner" style={{ width: 10, height: 10 }} /> : "⚡ Gen"}
                      </button>
                      <input ref={el => { uploadRefs.current[f.id] = el; }} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={async e => { const file = e.target.files?.[0]; if (file) { await handleUpload(f.id, file); e.target.value = ""; } }} />
                      <button onClick={() => uploadRefs.current[f.id]?.click()} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.08)", color: "#a78bfa", cursor: "pointer", fontWeight: 700 }}>
                        📁 Upload
                      </button>
                      <button onClick={() => deleteFrame(f.id)} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(239,68,68,.3)", background: "transparent", color: "#f87171", cursor: "pointer" }}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={addFrame} style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "2px dashed rgba(255,255,255,.2)", background: "transparent", color: "rgba(255,255,255,.5)", cursor: "pointer" }}>
            + Add Frame Manually
          </button>
        </div>
      </div>
    </div>
  );
}

const fetcher = (u: string) => { const c = new AbortController(); setTimeout(() => c.abort(), 6000); return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null); };

type Generation = { id: string; type: string; model?: string | null; status: string; seed?: number | null; image_path: string | null; video_path: string | null; audio_path?: string | null; voice?: string | null; error?: string | null; ref_image?: string | null; created_at: string; completed_at?: string | null; };
type Frame = { id: string; shot_id: string; frame_number: number; description: string; prompt?: string; needed: boolean; image_path: string | null; video_path: string | null; status: string; ai_suggested: boolean; created_at: string; };
type Shot = { id: string; project_id: string; shot_number: number; character: string | null; shot_description: string; environment: string; lighting: string; camera_angle: string; full_prompt: string; negative_prompt: string; seed: number | null; width: number; height: number; steps: number; status: string; approved_image_id: string | null; approved_image_ids: string[]; approved_video_id: string | null; approved_tts_id: string | null; latest_image: string | null; latest_video: string | null; attempt_count: number; story_line: string | null; dialogue: string | null; anchor: string | null; audio_path: string | null; video_audio_path: string | null; generations?: Generation[]; frames?: Frame[]; pipeline_model: string | null; prompt_template_id?: string | null; prompt_template_formula?: string | null; prompt_template_name?: string | null; template_resolved?: Record<string, string>; };
type PromptTemplate = { id: string; project_id: string; name: string; formula: string; is_default: boolean; created_at: string; };
type Episode = { id: string; number: number; title: string; shot_count: number; done_count: number; };
type Project = { id: string; name: string; base_image_path?: string | null; pipeline_model?: string | null; default_model?: string | null; };
type Char = { id: string; name: string; appearance: string; role: string; reference_image: string | null; latest_image: string | null; status: string; pipeline_model?: string | null; latest_model?: string | null; };

export default function EpisodePage() {
  const { id, epId } = useParams<{ id: string; epId: string }>();
  const router = useRouter();
  const SWR_OPTS = { revalidateOnFocus: false, revalidateOnReconnect: false } as const;
  const { data: project } = useSWR<Project>(`/api/projects/${id}`, fetcher, SWR_OPTS);
  const { data: appConfig } = useSWR<{ default_model: string | null }>("/api/config", fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const { data: episodes } = useSWR<Episode[]>(`/api/projects/${id}/episodes`, fetcher, SWR_OPTS);
  const { data: chars, mutate: mutateChars } = useSWR<Char[]>(`/api/projects/${id}/characters`, fetcher, { ...SWR_OPTS, refreshInterval: 8000 });
  const { data: shots, mutate } = useSWR<Shot[]>(`/api/episodes/${epId}/shots`, fetcher, SWR_OPTS);
  const [editing, setEditing] = useState<Shot | null>(null);
  const [editingTTS, setEditingTTS] = useState<Shot | null>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [vidLoading, setVidLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [showChars, setShowChars] = useState(false);
  const [lbRegenModal, setLbRegenModal] = useState(false);
  const [lbRegenShotId, setLbRegenShotId] = useState<string | null>(null);
  const [frameMgrShotId, setFrameMgrShotId] = useState<string | null>(null);
  const [frameImageLightbox, setFrameImageLightbox] = useState<{ imagePath: string; frameNumber: number; description: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [addingShot, setAddingShot] = useState(false);
  const [shotForm, setShotForm] = useState({ shot_description: "", character: "", environment: "", lighting: "", camera_angle: "", dialogue: "", story_line: "" });
  const [shotLoading, setShotLoading] = useState(false);

  const currentEp = episodes?.find(e => e.id === epId);
  const currentIdx = episodes?.findIndex(e => e.id === epId) ?? -1;
  const prevEp = currentIdx > 0 ? episodes?.[currentIdx - 1] : null;
  const nextEp = episodes && currentIdx < episodes.length - 1 ? episodes[currentIdx + 1] : null;

  useEffect(() => {
    const hasGenerating = shots?.some(s =>
      s.status === "generating" || s.status === "video_generating" ||
      s.generations?.some((g: { status: string }) => g.status === "running")
    );
    if (hasGenerating && !pollTimer.current) {
      pollTimer.current = setInterval(async () => {
        try {
          const ac = new AbortController(); setTimeout(() => ac.abort(), 15000);
          await fetch("/api/poll", { signal: ac.signal });
        } catch { /* ignore */ }
        mutate();
      }, 5000);
    } else if (!hasGenerating && pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    return () => { if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; } };
  }, [shots, mutate]);

  const [polling, setPolling] = useState(false);
  async function pollNow() {
    setPolling(true);
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 15000);
      const r = await fetch("/api/poll", { signal: c.signal });
      const d = await r.json();
      if (d.completed?.length) mutate();
    } catch { /* timeout or error — ignore */ }
    setPolling(false);
  }

  async function generateEpisode(regenerateAll = false) {
    setGenLoading(true);
    const res = await fetch(`/api/episodes/${epId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateAll }),
    });
    const data = await res.json();
    const skipped = data.skippedNoChar ?? 0;
    const msg = skipped > 0
      ? `Queued ${data.queued} shots${regenerateAll ? " (all)" : ""} · ${skipped} skipped (no character)`
      : `Queued ${data.queued} shots${regenerateAll ? " (all)" : ""}`;
    toast(msg, data.queued > 0 ? "success" : "warning");
    setGenLoading(false);
    mutate();
  }

  async function generateSingle(shotId: string, newSeed?: number, opts?: { autoApprove?: boolean }) {
    const shot = (shots ?? []).find(s => s.id === shotId);
    const charData = shot?.character ? chars?.find(c => c.name === shot.character) : null;
    const model = (shot as Record<string,unknown>)?.pipeline_model as string | undefined
      ?? charData?.pipeline_model
      ?? project?.pipeline_model
      ?? undefined;
    const res = await fetch(`/api/shots/${shotId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: newSeed, model }),
    });
    const genResp = await res.json().catch(() => null) as { prompt_id?: string } | null;
    mutate();
    // Poll aggressively until shot is no longer generating (max 60s)
    let polls = 0;
    const pollInterval = setInterval(async () => {
      polls++;
      try { await fetch("/api/poll", { signal: AbortSignal.timeout(10000) }); } catch { /* ignore */ }
      mutate();
      // Stop polling once the shot is done or after 30 attempts (~60s)
      const current = (await fetch(`/api/shots/${shotId}`).then(r => r.json()).catch(() => null)) as { shot?: { status?: string }; generations?: Array<{ id: string; type: string; status: string; comfyui_prompt_id?: string | null; image_path?: string | null; created_at: string }> } | null;
      const currentShot = current?.shot;
      if (polls >= 30 || (currentShot?.status && !["generating", "video_generating"].includes(currentShot.status))) {
        clearInterval(pollInterval);
        // Auto-approve the newly completed image when requested.
        // Prefer matching by the prompt_id we just queued; otherwise use the latest completed image gen.
        if (opts?.autoApprove && currentShot?.status !== "failed") {
          const gens = current?.generations ?? [];
          const match = (genResp?.prompt_id && gens.find(g => g.comfyui_prompt_id === genResp.prompt_id && g.status === "completed" && g.image_path))
            ?? gens
              .filter(g => (g.type === "image" || g.type.startsWith("image:")) && g.status === "completed" && !!g.image_path)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          if (match) {
            await fetch(`/api/shots/${shotId}/approve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ generation_id: match.id }),
            });
            mutate();
          }
        }
      }
    }, 2000);
  }

  async function generateSingleAllModels(shotId: string) {
    await fetch(`/api/shots/${shotId}/generate-all-models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    mutate();
  }

  async function approve(shotId: string, genId: string) {
    await fetch(`/api/shots/${shotId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generation_id: genId }) });
    mutate();
  }

  async function generateVideo(shotId: string, preset = "balanced") {
    // `force: true` makes the API supersede any orphan "running" record
    // (pod restart/crash) so regeneration always proceeds from this button.
    const res = await fetch(`/api/shots/${shotId}/generate-video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset, force: true }) });
    const d = await res.json();
    if (!res.ok) { toast(`Video error: ${d.error}`, "error"); }
    else if (d.skipped) { toast("Already generating — wait for current render to finish", "warning"); }
    else if (d.queued === 0 && d.errors?.length) { toast(`Video failed: ${d.errors[0]}`, "error"); }
    else if (d.queued === 0 && d.pending === 0) { toast("Video generation produced no results", "error"); }
    else if (d.queued > 0) { toast(d.has_audio ? "Video queued" : "Video queued (no audio)", "success"); }
    mutate();
  }

  async function deleteGeneration(genId: string) {
    await fetch(`/api/generations/${genId}`, { method: "DELETE" });
    mutate();
  }

  async function generateAllVideos() {
    setVidLoading(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/generate-videos`, { method: "POST" });
      const data = await res.json();
      if (data.queued > 0) toast(`Queued ${data.queued} video(s)`, "success");
      else if (data.errors?.length) toast(`Video failed: ${data.errors[0]}`, "error");
      else toast(data.message || "No shots ready for video (need approved images first)", "warning");
      if (data.queued > 0 && data.errors?.length) toast(`${data.errors.length} shot(s) failed — ${data.errors[0]}`, "warning");
      if (data.errors?.length) console.warn("Video generation errors:", data.errors);
    } catch (e) { toast("Error: " + String(e), "error"); }
    setVidLoading(false);
    mutate();
  }

  async function cleanupStale() {
    try {
      const res = await fetch(`/api/episodes/${epId}/cleanup-stale`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast(`Cleanup failed: ${data.error ?? res.statusText}`, "error"); return; }
      if (data.cleaned === 0) { toast("No stuck generations — nothing to clean.", "info"); return; }
      const parts = Object.entries(data.byType as Record<string, number>).map(([t, n]) => `${t}: ${n}`).join(", ");
      toast(`Unstuck ${data.cleaned} generation${data.cleaned === 1 ? "" : "s"} (${parts})`, "success");
    } catch (e) { toast("Error: " + String(e), "error"); }
    mutate();
  }

  // ── Regen modal ──
  const [regenModal, setRegenModal] = useState(false);
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);

  async function runRegen(opts: RegenOptions) {
    setRegenModal(false);
    setGenLoading(true);
    const body: Record<string, unknown> = { regenerateAll: true, clearOld: opts.clearOld };
    if (opts.models.length > 0) body.models = opts.models; // specific subset
    const res = await fetch(`/api/episodes/${epId}/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    toast(`Queued ${data.queued ?? 0} generations`, "success");
    setGenLoading(false);
    mutate();
  }

  const [ttsVidLoading, setTtsVidLoading] = useState(false);
  async function generateAllTTS() {
    if (!confirm("Generate TTS audio for all shots with dialogue?")) return;
    setTtsVidLoading(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/generate-videos-with-tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsOnly: true }),
      });
      const data = await res.json();
      toast(`TTS: ${data.tts_generated} generated`, "success");
      if (data.errors?.length) {
        toast(`${data.errors.length} error(s) — ${data.errors[0]}`, "warning");
        console.warn("TTS errors:", data.errors);
      }
    } catch (e) { toast("Error: " + String(e), "error"); }
    setTtsVidLoading(false);
    mutate();
  }

  // ── Consistency check state ──
  type ConsistencyIssue = { shots: number[]; type: string; severity: string; description: string; fix: string };
  type ShotFact = { shot: number; weather: string; time: string; lighting: string; location: string; indoor_outdoor: string; mood: string; character: string };
  const [consistencyResult, setConsistencyResult] = useState<{ summary: string; issues: ConsistencyIssue[]; facts?: ShotFact[] } | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);

  async function runConsistencyCheck() {
    setConsistencyLoading(true);
    setShowConsistency(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/consistency-check`, { method: "POST" });
      const data = await res.json();
      if (data.error) { toast(data.error, "error"); setConsistencyResult(null); }
      else setConsistencyResult(data);
    } catch (e) { toast("Error: " + e, "error"); }
    setConsistencyLoading(false);
  }

  const [fixPromptsLoading, setFixPromptsLoading] = useState(false);
  async function fixPrompts(useLLM = true) {
    setFixPromptsLoading(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/regenerate-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_llm: useLLM, force: true }),
      });
      const data = await res.json();
      if (data.error) { toast(data.error, "error"); }
      else {
        toast(`Fixed ${data.updated} of ${data.total} shot prompts`, "success");
        if (data.errors?.length) toast(`${data.errors.length} error(s) — check console`, "warning");
        mutate();
      }
    } catch (e) { toast("Error: " + e, "error"); }
    setFixPromptsLoading(false);
  }

  const [approveLoading, setApproveLoading] = useState(false);
  async function approveAll() {
    if (!confirm("Approve ALL generated images in this episode?")) return;
    setApproveLoading(true);
    try {
      const res = await fetch(`/api/episodes/${epId}/approve-all`, { method: "POST" });
      const data = await res.json();
      toast(`Approved ${data.approved} of ${data.total} shots`, "success");
    } catch (e) { toast("Error: " + e, "error"); }
    setApproveLoading(false);
    mutate();
  }

  async function addShot(e: React.FormEvent) {
    e.preventDefault();
    if (!shotForm.shot_description.trim()) return;
    setShotLoading(true);
    const res = await fetch(`/api/episodes/${epId}/shots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shot_description: shotForm.shot_description.trim(),
        character: shotForm.character.trim() || undefined,
        environment: shotForm.environment.trim() || undefined,
        lighting: shotForm.lighting.trim() || undefined,
        camera_angle: shotForm.camera_angle.trim() || undefined,
        dialogue: shotForm.dialogue.trim() || undefined,
        story_line: shotForm.story_line.trim() || undefined,
      }),
    });
    if (res.ok) {
      setShotForm({ shot_description: "", character: "", environment: "", lighting: "", camera_angle: "", dialogue: "", story_line: "" });
      setAddingShot(false);
      mutate();
      toast("Shot created", "success");
    } else {
      const d = await res.json();
      toast(d.error ?? "Failed", "error");
    }
    setShotLoading(false);
  }

  const filtered = (shots ?? []).filter(s => filter === "all" || s.status === filter);
  const statuses = ["all", "draft", "generating", "done", "approved", "video_generating", "video_done", "failed"];
  const counts = (shots ?? []).reduce((acc, s) => { acc[s.status] = (acc[s.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  // Open the review lightbox for a given shot (shared by card click + next/prev shot navigation).
  function openLightboxForShot(shotId: string) {
    const shot = (shots ?? []).find(s => s.id === shotId);
    if (!shot) return;
    const gens = shot.generations ?? [];
    const imageGens = gens.filter((g: Generation) => g.type === "image" || g.type.startsWith("image:"));
    const videoGens = gens.filter((g: Generation) => g.type === "video" || g.type.startsWith("video:"));
    const ttsGens = gens.filter((g: Generation) => g.type === "tts");
    const approvedIds = shot.approved_image_ids ?? (shot.approved_image_id ? [shot.approved_image_id] : []);
    const charData = chars?.find(c => c.name === shot.character);
    const shotPipelineModel = (shot as Record<string, unknown>)?.pipeline_model as string | null ?? charData?.pipeline_model ?? null;
    const lbImages = imageGens.filter((g: Generation) => g.image_path);
    const sharedProps = {
      shotNumber: shot.shot_number,
      storyLine: shot.story_line, dialogue: shot.dialogue, anchor: shot.anchor,
      charName: shot.character,
      charRefImage: charData?.latest_image ?? charData?.reference_image ?? null,
      videoGens, ttsGens, imageGens,
      frames: shot.frames ?? [],
      fullPrompt: shot.full_prompt,
      approvedVideoId: shot.approved_video_id,
      approvedTtsId: shot.approved_tts_id,
      approvedImageId: shot.approved_image_id,
      shotPipelineModel,
    };
    const lbItems: LightboxItem[] = lbImages.map((g: Generation) => ({
      imagePath: g.image_path!,
      genId: g.id,
      shotId: shot.id,
      isApproved: approvedIds.includes(g.id),
      model: (g as Record<string, unknown>).model as string | undefined,
      ...sharedProps,
    }));
    const emptyPlaceholder: LightboxItem = {
      imagePath: "", genId: "", shotId: shot.id,
      isApproved: false,
      ...sharedProps,
    };
    const items = lbItems.length ? lbItems : [emptyPlaceholder];
    const startIdx = lbItems.findIndex(i => approvedIds.includes(i.genId));
    setLightbox({ items, index: startIdx >= 0 ? startIdx : items.length - 1 });
  }

  // Derive prev/next shot for lightbox navigation (based on the visible, filtered list).
  const lbShotId = lightbox?.items[0]?.shotId ?? null;
  const lbShotIdx = lbShotId ? filtered.findIndex(s => s.id === lbShotId) : -1;
  const prevShot = lbShotIdx > 0 ? filtered[lbShotIdx - 1] : null;
  const nextShot = lbShotIdx >= 0 && lbShotIdx < filtered.length - 1 ? filtered[lbShotIdx + 1] : null;


  // Pipeline progress stats
  const total = shots?.length ?? 0;
  const generated = (counts["done"] ?? 0) + (counts["approved"] ?? 0) + (counts["video_generating"] ?? 0) + (counts["video_done"] ?? 0);
  const approved = (counts["approved"] ?? 0) + (counts["video_generating"] ?? 0) + (counts["video_done"] ?? 0);
  const videoDone = counts["video_done"] ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── Top nav ── */}
      <nav style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/projects" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 800, fontSize: 16 }}>◈</Link>
        <span style={{ color: "var(--border)" }}>/</span>
        <Link href={`/projects/${id}`} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>{project?.name ?? "…"}</Link>
        <span style={{ color: "var(--border)" }}>/</span>

        {/* Episode selector dropdown */}
        <select
          value={epId}
          onChange={e => router.push(`/projects/${id}/episodes/${e.target.value}`)}
          style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 600 }}
        >
          {episodes?.map(ep => (
            <option key={ep.id} value={ep.id}>
              EP {ep.number}: {ep.title} ({ep.done_count}/{ep.shot_count})
            </option>
          ))}
        </select>

        {/* Prev / Next buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-secondary btn-sm" disabled={!prevEp} onClick={() => prevEp && router.push(`/projects/${id}/episodes/${prevEp.id}`)} style={{ padding: "4px 8px" }}>
            ◀ Prev
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!nextEp} onClick={() => nextEp && router.push(`/projects/${id}/episodes/${nextEp.id}`)} style={{ padding: "4px 8px" }}>
            Next ▶
          </button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {/* Secondary group */}
          <button className={`btn btn-sm ${showChars ? "btn-primary" : "btn-secondary"}`} onClick={() => setShowChars(!showChars)}>
            👤 {chars?.length ? `(${chars.length})` : "Characters"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={pollNow} disabled={polling} title="Poll for completed generations">
            {polling ? <span className="spinner" /> : "🔄"}
          </button>

          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

          {/* Analysis */}
          <button className="btn btn-secondary btn-sm" onClick={runConsistencyCheck} disabled={consistencyLoading} title="Check shot continuity">
            {consistencyLoading ? <span className="spinner" /> : "🔍"} Continuity
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => fixPrompts(false)} disabled={fixPromptsLoading} title="Fix shot prompts">
            {fixPromptsLoading ? <span className="spinner" /> : "✏"} Fix Prompts
          </button>
          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

          {/* Generation */}
          <button className="btn btn-primary btn-sm" onClick={() => generateEpisode(false)} disabled={genLoading} title="Generate only shots without images">
            {genLoading ? <span className="spinner" /> : "⚡"} Generate New
          </button>
          <button className="btn btn-sm" onClick={() => setRegenModal(true)} disabled={genLoading}
            style={{ background: "rgba(233,69,96,.15)", color: "var(--accent)", border: "1px solid rgba(233,69,96,.4)", borderRadius: 6, fontWeight: 700, fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
            ↺ Regen All
          </button>
          <button className="btn btn-secondary btn-sm" onClick={approveAll} disabled={approveLoading}>
            {approveLoading ? <span className="spinner" /> : "✓"} Approve All
          </button>
          <button className="btn btn-sm" onClick={() => setBulkDeleteModal(true)} disabled={genLoading} title="Bulk delete images, videos, or TTS across this episode"
            style={{ background: "rgba(239,68,68,.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,.4)", borderRadius: 6, fontWeight: 700, fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
            🗑 Bulk Delete
          </button>

          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

          {/* Video / TTS */}
          <button className="btn btn-secondary btn-sm" onClick={generateAllVideos} disabled={vidLoading}>
            {vidLoading ? <span className="spinner" /> : "🎬"} Videos
          </button>
          <button className="btn btn-secondary btn-sm" onClick={generateAllTTS} disabled={ttsVidLoading}>
            {ttsVidLoading ? <span className="spinner" /> : "🎙"} TTS
          </button>
          <button
            className="btn btn-sm"
            onClick={cleanupStale}
            title="Mark any generation stuck in 'running' for >15min as failed, so regeneration works again (e.g. after a pod restart)."
            style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.4)", borderRadius: 6, fontWeight: 700, fontSize: 12, padding: "4px 10px" }}>
            ♻️ Unstick
          </button>
          <Link href={`/projects/${id}/episodes/${epId}/final-video`}
            className="btn btn-sm"
            style={{ background: "rgba(167,139,250,.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.4)", borderRadius: 6, fontWeight: 700, fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>
            🎞 Final Video
          </Link>

          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

          <button className="btn btn-primary btn-sm" onClick={() => { setAddingShot(true); setShotForm({ shot_description: "", character: "", environment: "", lighting: "", camera_angle: "", dialogue: "", story_line: "" }); }}>
            + Add Shot
          </button>
        </div>
      </nav>

      {/* ── Characters panel (collapsible) ── */}
      {showChars && chars && (
        <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "12px 24px", overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "center" }}>
            {chars.map(ch => (
              <div key={ch.id} style={{ flexShrink: 0, width: 108, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Link href={`/projects/${id}/characters/${ch.id}`} style={{ textDecoration: "none", color: "var(--text)" }}>
                  <div style={{ width: 92, height: 92, borderRadius: "50%", overflow: "hidden", margin: "0 auto", background: "var(--bg)", border: ch.status === "generating" ? "3px solid #f59e0b" : "3px solid var(--border)", transition: "border-color .2s" }}>
                    {ch.latest_image
                      ? <img src={ch.latest_image} alt={ch.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{ch.status === "generating" ? <span className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /> : "👤"}</div>}
                  </div>
                </Link>
                <div style={{ fontSize: 11, fontWeight: 700, lineHeight: "1.2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", textAlign: "center" }}>{ch.name}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center" }}>{ch.role}</div>
                <div style={{ display: "flex", gap: 3 }}>
                  <button onClick={() => fetch(`/api/characters/${ch.id}/generate`, { method: "POST" }).then(() => mutateChars())} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(233,69,96,.4)", background: "rgba(233,69,96,.08)", color: "var(--accent)", cursor: "pointer", fontWeight: 700 }}>⚡</button>
                  <label style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.08)", color: "#a78bfa", cursor: "pointer", fontWeight: 700 }}>
                    📁<input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append("file", f); await fetch(`/api/characters/${ch.id}/upload`, { method: "POST", body: fd }); mutateChars(); e.target.value = ""; } }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px" }}>
        {/* Episode title */}
        {currentEp && (
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Episode {currentEp.number}: {currentEp.title}
          </h2>
        )}

        {/* ── Character base image alert ── */}
        {(() => {
          const shotChars = new Set((shots ?? []).map(s => s.character).filter(Boolean));
          const missing = (chars ?? []).filter(c => shotChars.has(c.name) && !c.latest_image);
          if (!missing.length) return null;
          return (
            <div style={{ background: "#1c0a00", border: "1px solid #92400e", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: "#fbbf24", fontSize: 13 }}>Create base character images first — </span>
                <span style={{ color: "#fcd34d", fontSize: 12 }}>
                  {missing.map(c => c.name).join(", ")} {missing.length === 1 ? "has" : "have"} no reference image. Generate them before starting this episode for consistent character faces.
                </span>
              </div>
              <Link href={`/projects/${id}/characters`}
                style={{ background: "#b45309", color: "#fff", textDecoration: "none", fontSize: 12, padding: "7px 14px", borderRadius: 6, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>
                Setup Characters →
              </Link>
            </div>
          );
        })()}

        {/* Pipeline progress bar */}
        {total > 0 && (
          <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Production Pipeline</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {generated}/{total} images → {approved} approved → {videoDone} videos
              </span>
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--bg)", gap: 1 }}>
              <div style={{ width: `${(videoDone / total) * 100}%`, background: "#7c3aed", transition: "width .3s" }} title="Video done" />
              <div style={{ width: `${((counts["video_generating"] ?? 0) / total) * 100}%`, background: "#a78bfa", transition: "width .3s" }} title="Video generating" />
              <div style={{ width: `${((counts["approved"] ?? 0) / total) * 100}%`, background: "#059669", transition: "width .3s" }} title="Approved" />
              <div style={{ width: `${((counts["done"] ?? 0) / total) * 100}%`, background: "#f59e0b", transition: "width .3s" }} title="Generated" />
              <div style={{ width: `${((counts["generating"] ?? 0) / total) * 100}%`, background: "#3b82f6", transition: "width .3s" }} title="Generating" />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: "var(--muted)" }}>
              <span>🟣 Video done ({videoDone})</span>
              <span>🟢 Approved ({counts["approved"] ?? 0})</span>
              <span>🟡 Generated ({counts["done"] ?? 0})</span>
              <span>🔵 Generating ({counts["generating"] ?? 0})</span>
              <span>⚪ Draft ({counts["draft"] ?? 0})</span>
              {(counts["failed"] ?? 0) > 0 && <span style={{ color: "var(--error)" }}>❌ Failed ({counts["failed"]})</span>}
            </div>
          </div>
        )}

        {/* ── AI Consistency Check Results ── */}
        {showConsistency && (
          <div className="card" style={{ padding: "14px 18px", marginBottom: 16, borderLeft: "3px solid #d97706" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#d97706" }}>🔍 Shot Continuity Check — Weather · Lighting · Characters</span>
              <button className="btn btn-secondary btn-xs" onClick={() => setShowConsistency(false)}>✕ Close</button>
            </div>
            {consistencyLoading ? (
              <div style={{ textAlign: "center", padding: 20, color: "var(--muted)" }}><span className="spinner" /> Extracting facts from prompts...</div>
            ) : consistencyResult ? (
              <>
                {/* Summary */}
                <p style={{ fontSize: 12, color: "var(--text)", marginBottom: 12, lineHeight: 1.5, fontWeight: 600 }}>{consistencyResult.summary}</p>

                {/* Extracted facts table */}
                {consistencyResult.facts && consistencyResult.facts.length > 0 && (
                  <div style={{ marginBottom: 12, overflowX: "auto" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "var(--muted)" }}>📋 Extracted Facts (what AI sees in each prompt)</div>
                    <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", background: "var(--bg)", borderRadius: 6 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--border)" }}>
                          {["Shot", "Weather", "Time", "Lighting", "Location", "In/Out", "Mood", "Character"].map(h => (
                            <th key={h} style={{ padding: "4px 6px", textAlign: "left", color: "var(--muted)", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {consistencyResult.facts.map((f, i) => {
                          // Highlight cells that differ from previous row
                          const prev = i > 0 ? consistencyResult.facts![i - 1] : null;
                          const diff = (field: keyof ShotFact) => prev && f[field] !== "none" && prev[field] !== "none" && f[field] !== prev[field];
                          const cellStyle = (field: keyof ShotFact) => ({
                            padding: "3px 6px", borderBottom: "1px solid var(--border)",
                            background: diff(field) ? "#ef444420" : "transparent",
                            color: f[field as keyof ShotFact] === "none" ? "var(--muted)" : "var(--text)",
                          });
                          return (
                            <tr key={i}>
                              <td style={{ padding: "3px 6px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>#{f.shot}</td>
                              <td style={cellStyle("weather")}>{f.weather}</td>
                              <td style={cellStyle("time")}>{f.time}</td>
                              <td style={cellStyle("lighting")}>{f.lighting}</td>
                              <td style={{ padding: "3px 6px", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>{f.location}</td>
                              <td style={cellStyle("indoor_outdoor")}>{f.indoor_outdoor}</td>
                              <td style={cellStyle("mood")}>{f.mood}</td>
                              <td style={{ padding: "3px 6px", borderBottom: "1px solid var(--border)", color: "var(--text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.character}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>🔴 Red cells = value changed from previous shot</div>
                  </div>
                )}

                {/* Issues list */}
                {consistencyResult.issues.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✅ No inconsistencies detected!</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>⚠️ Issues ({consistencyResult.issues.length})</div>
                    {consistencyResult.issues.map((issue, i) => {
                      const sevColor = issue.severity === "critical" ? "#ef4444" : issue.severity === "warning" ? "#f59e0b" : "#6b7280";
                      return (
                        <div key={i} style={{ background: "var(--bg)", borderRadius: 6, padding: "10px 12px", borderLeft: `3px solid ${sevColor}` }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: sevColor, textTransform: "uppercase", padding: "1px 6px", background: sevColor + "18", borderRadius: 3 }}>{issue.severity}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{issue.type}</span>
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>Shots {issue.shots.join(" → ")}</span>
                          </div>
                          <p style={{ fontSize: 11, color: "var(--text)", margin: "2px 0", lineHeight: 1.4 }}>{issue.description}</p>
                          <p style={{ fontSize: 10, color: "var(--accent)", margin: "4px 0 0" }}>💡 {issue.fix}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Add Shot inline form */}
        {addingShot && (
          <form onSubmit={addShot} style={{ background: "var(--bg3)", border: "1px solid var(--accent)", borderRadius: 10, padding: 16, marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>New Shot</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                autoFocus required
                value={shotForm.shot_description} onChange={e => setShotForm(f => ({ ...f, shot_description: e.target.value }))}
                placeholder="Shot description (required)"
                style={{ flex: "1 1 300px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
              <input
                value={shotForm.character} onChange={e => setShotForm(f => ({ ...f, character: e.target.value }))}
                placeholder="Character (optional)"
                style={{ flex: "1 1 160px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
              <input
                value={shotForm.environment} onChange={e => setShotForm(f => ({ ...f, environment: e.target.value }))}
                placeholder="Environment (optional)"
                style={{ flex: "1 1 160px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
              <input
                value={shotForm.lighting} onChange={e => setShotForm(f => ({ ...f, lighting: e.target.value }))}
                placeholder="Lighting (optional)"
                style={{ flex: "1 1 140px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
              <input
                value={shotForm.camera_angle} onChange={e => setShotForm(f => ({ ...f, camera_angle: e.target.value }))}
                placeholder="Camera angle (optional)"
                style={{ flex: "1 1 160px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
              <input
                value={shotForm.dialogue} onChange={e => setShotForm(f => ({ ...f, dialogue: e.target.value }))}
                placeholder="Dialogue (optional)"
                style={{ flex: "1 1 200px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
              <input
                value={shotForm.story_line} onChange={e => setShotForm(f => ({ ...f, story_line: e.target.value }))}
                placeholder="Story line (optional)"
                style={{ flex: "1 1 200px", background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "7px 12px", fontSize: 14 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={shotLoading || !shotForm.shot_description.trim()}>
                {shotLoading ? <span className="spinner" /> : "Create Shot"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingShot(false)}>Cancel</button>
            </div>
          </form>
        )}

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {statuses.map(s => {
            const count = s === "all" ? (shots?.length ?? 0) : (counts[s] ?? 0);
            const icons: Record<string, string> = { all: "◈", draft: "○", generating: "⟳", done: "◉", approved: "✅", video_generating: "🎬", video_done: "🟣", failed: "✗" };
            const colors: Record<string, string> = { done: "#f59e0b", approved: "#22c55e", video_generating: "#7c3aed", video_done: "#7c3aed", failed: "#ef4444", generating: "#3b82f6" };
            const activeColor = colors[s];
            const isActive = filter === s;
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: "5px 12px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                borderRadius: 20, border: isActive ? `2px solid ${activeColor ?? "var(--accent)"}` : "2px solid var(--border)",
                background: isActive ? (activeColor ? activeColor + "22" : "var(--accent-dim, #1e3a5f)") : "var(--bg2)",
                color: isActive ? (activeColor ?? "var(--accent)") : "var(--muted)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .15s",
              }}>
                <span style={{ fontSize: 10, opacity: .85 }}>{icons[s] ?? "•"}</span>
                {s === "all" ? "All" : s === "video_done" ? "Video Done" : s === "video_generating" ? "Rendering" : s.charAt(0).toUpperCase() + s.slice(1)}
                {count > 0 && <span style={{ background: isActive ? (activeColor ?? "var(--accent)") + "33" : "var(--border)", color: isActive ? (activeColor ?? "var(--accent)") : "var(--text)", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{count}</span>}
              </button>
            );
          })}
        </div>

        {!shots ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}><span className="spinner" /></div>
        ) : (
          /* ── All filters: unified ShotCard grid ── */
          <div>
            {filter === "done" && filtered.length > 0 && (
              <div style={{ background: "rgba(245,158,11,.1)", border: "1px solid #f59e0b", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>◉</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>{filtered.length} shot{filtered.length !== 1 ? "s" : ""} generated — click a shot image to review and approve.</span>
                <button className="btn btn-sm" onClick={approveAll} disabled={approveLoading} style={{ marginLeft: "auto", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, flexShrink: 0 }}>
                  {approveLoading ? <span className="spinner" /> : "✅"} Approve All
                </button>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
              {filtered.map(shot => {
                const gens = shot.generations ?? [];
                const imageGens = gens.filter(g => g.type === "image" || g.type.startsWith("image:"));
                const videoGens = gens.filter(g => g.type === "video" || g.type.startsWith("video:"));
                const ttsGens = gens.filter(g => g.type === "tts");
                const approvedIds = shot.approved_image_ids ?? (shot.approved_image_id ? [shot.approved_image_id] : []);
                const charData = chars?.find(c => c.name === shot.character);
                const resolvedDefaultModel: string | null =
                  (shot as Record<string, unknown>).pipeline_model as string | null
                  ?? charData?.pipeline_model
                  ?? charData?.latest_model
                  ?? project?.pipeline_model
                  ?? appConfig?.default_model
                  ?? null;
                return (
                  <ShotCard key={shot.id} shot={shot} defaultModel={resolvedDefaultModel}
                    onEdit={() => setEditing(shot)}
                    onGenerate={() => generateSingle(shot.id, undefined, { autoApprove: true })}
                    onFrameClick={(fId) => {
                      if (fId === "__add__") { setFrameMgrShotId(shot.id); return; }
                      const frame = shot.frames?.find(f => f.id === fId);
                      if (frame?.image_path) {
                        setFrameImageLightbox({ imagePath: frame.image_path, frameNumber: frame.frame_number, description: frame.description ?? "" });
                      } else {
                        setFrameMgrShotId(shot.id);
                      }
                    }}
                    onUpload={async (file) => {
                      const fd = new FormData(); fd.append("file", file);
                      await fetch(`/api/shots/${shot.id}/upload`, { method: "POST", body: fd });
                      mutate();
                    }}
                    onImageClick={() => openLightboxForShot(shot.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editing && (() => {
        const sortedShots = [...(shots ?? [])].sort((a, b) => a.shot_number - b.shot_number);
        const idx = sortedShots.findIndex(s => s.id === editing.id);
        const prev = idx > 0 ? sortedShots[idx - 1] : null;
        const next = idx < sortedShots.length - 1 ? sortedShots[idx + 1] : null;
        return (
          <ShotEditor
            shot={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); mutate(); }}
            onNavigate={(dir) => { const target = dir === "prev" ? prev : next; if (target) { setEditing(target); mutate(); } }}
            characters={chars}
            adjacentShots={{
              prev: prev ? { shot_number: prev.shot_number, full_prompt: prev.full_prompt, environment: prev.environment, lighting: prev.lighting, character: prev.character } : null,
              next: next ? { shot_number: next.shot_number, full_prompt: next.full_prompt, environment: next.environment, lighting: next.lighting, character: next.character } : null,
            }}
            episodeId={epId}
          />
        );
      })()}

      {editingTTS && (
        <ShotEditorNew
          shot={editingTTS}
          onClose={() => setEditingTTS(null)}
          onSaved={() => { setEditingTTS(null); mutate(); }}
        />
      )}

      {lightbox && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(lb => lb ? { ...lb, index: (lb.index - 1 + lb.items.length) % lb.items.length } : null)}
          onNext={() => setLightbox(lb => lb ? { ...lb, index: (lb.index + 1) % lb.items.length } : null)}
          onJump={(i) => setLightbox(lb => lb ? { ...lb, index: i } : null)}
          onPrevShot={prevShot ? () => openLightboxForShot(prevShot.id) : undefined}
          onNextShot={nextShot ? () => openLightboxForShot(nextShot.id) : undefined}
          prevShotLabel={prevShot ? `S${String(prevShot.shot_number).padStart(2, "0")}` : null}
          nextShotLabel={nextShot ? `S${String(nextShot.shot_number).padStart(2, "0")}` : null}
          onApprove={async (genId, shotId) => {
            const res = await fetch(`/api/shots/${shotId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generation_id: genId }) });
            const data = await res.json();
            mutate();
            const approvedIds: string[] = data.approved_image_ids ?? [];
            const lastApprovedId = approvedIds[approvedIds.length - 1] ?? null;
            setLightbox(lb => lb ? {
              ...lb,
              items: lb.items.map(i => ({
                ...i,
                isApproved: i.shotId === shotId ? approvedIds.includes(i.genId) : i.isApproved,
                approvedImageId: i.shotId === shotId ? lastApprovedId : i.approvedImageId,
              })),
            } : null);
          }}
          onDelete={async (genId) => {
            await fetch(`/api/generations/${genId}`, { method: "DELETE" });
            mutate();
            setLightbox(lb => lb ? { ...lb, items: lb.items.map(item => ({ ...item, imageGens: (item.imageGens ?? []).filter(g => g.id !== genId) })) } : null);
          }}
          onApproveVideo={async (genId, shotId) => {
            const res = await fetch(`/api/shots/${shotId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generation_id: genId }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { toast(d.error ?? "Set as final failed", "error"); return; }
            const newApproved: string | null = "approved_video_id" in d ? d.approved_video_id : genId;
            toast(newApproved ? "📹 Set as final" : "Removed final", "success");
            mutate();
            setLightbox(lb => lb ? { ...lb, items: lb.items.map(i => ({ ...i, approvedVideoId: i.shotId === shotId ? newApproved : i.approvedVideoId })) } : null);
          }}
          onGenerateVideo={async (shotId, preset) => {
            await generateVideo(shotId, preset);
          }}
          onRenderVideoEffect={async (shotId, effect) => {
            try {
              const res = await fetch(`/api/shots/${shotId}/generate-video-effect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ effect }),
              });
              const d = await res.json();
              if (!res.ok) { toast(`Effect render failed: ${d.error ?? res.statusText}`, "error"); }
              else { toast(`✨ ${effect} rendered`, "success"); }
            } catch (e) {
              toast(`Effect render failed: ${e instanceof Error ? e.message : String(e)}`, "error");
            }
            mutate();
          }}
          onDeleteGen={async (genId) => {
            await fetch(`/api/generations/${genId}`, { method: "DELETE" });
            mutate();
            setLightbox(lb => lb ? {
              ...lb,
              items: lb.items.map(item => ({
                ...item,
                videoGens: (item.videoGens ?? []).filter(g => g.id !== genId),
                ttsGens: (item.ttsGens ?? []).filter(g => g.id !== genId),
                approvedVideoId: item.approvedVideoId === genId ? null : item.approvedVideoId,
              })),
            } : null);
          }}
          onRegenerate={async (shotId, model) => {
            await fetch(`/api/shots/${shotId}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
            toast(`Queued generation${model ? ` (${model.split(/[-_]/)[0].slice(0,12)})` : ""}`, "success");
            mutate();
            const earlyPolls = [2000, 4000, 6000, 10000, 15000, 20000];
            for (const delay of earlyPolls) {
              setTimeout(async () => { try { await fetch("/api/poll", { signal: AbortSignal.timeout(10000) }); } catch { /* ignore */ } mutate(); }, delay);
            }
          }}
          onGenerateImage={(shotId) => { generateSingle(shotId); }}
          onGenerateTTS={async (shotId, voice) => {
            const shot = (shots ?? []).find(s => s.id === shotId);
            const text = shot?.dialogue?.trim() || shot?.story_line?.trim() || "";
            if (!text) { toast("No dialogue or story line for this shot", "warning"); return null; }
            const res = await fetch(`/api/shots/${shotId}/generate-tts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dialogue: text, voice }),
            });
            const d = await res.json();
            if (!res.ok) { toast(`TTS error: ${d.error}`, "error"); return null; }
            toast("🎙 Audio generated", "success");
            mutate();
            return { audio_path: d.audio_path };
          }}
          onGenerateAllModels={(shotId) => {
            setLbRegenShotId(shotId);
            setLbRegenModal(true);
          }}
          onUploadImage={async (shotId, file) => {
            const fd = new FormData(); fd.append("file", file);
            const res = await fetch(`/api/shots/${shotId}/upload`, { method: "POST", body: fd });
            if (!res.ok) { toast("Upload failed", "error"); return; }
            mutate();
            setLightbox(null);
          }}
          onBulkDelete={async (shotId) => {
            await fetch(`/api/shots/${shotId}/generations`, { method: "DELETE" });
            mutate();
          }}
          onBulkDeleteRefresh={(deletedIds) => {
            mutate();
            if (deletedIds.length > 0) {
              const del = new Set(deletedIds);
              setLightbox(lb => lb ? {
                ...lb,
                items: lb.items.map(it => ({
                  ...it,
                  imageGens: (it.imageGens ?? []).filter(g => !del.has(g.id)),
                  videoGens: (it.videoGens ?? []).filter(g => !del.has(g.id)),
                  // If the currently-displayed image was deleted, clear its path so the thumb disappears
                  imagePath: del.has(it.genId) ? "" : it.imagePath,
                })).filter(it => it.imagePath !== "" || (it.imageGens ?? []).length > 0 || (it.videoGens ?? []).length > 0 || (it.ttsGens ?? []).length > 0),
              } : null);
            }
          }}
        />
      )}

      {/* ── Regen All Modal ── */}
      {regenModal && (
        <RegenModal
          title="Regenerate All Shots"
          subtitle={`${(shots ?? []).length} shots in this episode`}
          onConfirm={runRegen}
          onClose={() => setRegenModal(false)}
        />
      )}

      {/* ── Bulk Delete Modal ── */}
      {bulkDeleteModal && (
        <BulkDeleteModal
          episodeId={epId}
          episodeLabel={`${(shots ?? []).length} shots`}
          onClose={() => setBulkDeleteModal(false)}
          onDeleted={(count) => { toast(`Deleted ${count} generation${count === 1 ? "" : "s"}`, "success"); mutate(); }}
        />
      )}

      {/* ── Lightbox: Generate All Models Modal ── */}
      {lbRegenModal && lbRegenShotId && (
        <RegenModal
          title="Generate — All Models"
          subtitle="Generate this shot with selected models"
          onConfirm={async (opts) => {
            setLbRegenModal(false);
            if (opts.models.length === 0) {
              await fetch(`/api/shots/${lbRegenShotId}/generate-all-models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearOld: opts.clearOld }) });
            } else {
              for (const model of opts.models) {
                await fetch(`/api/shots/${lbRegenShotId}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
              }
            }
            mutate();
            setLbRegenShotId(null);
          }}
          onClose={() => { setLbRegenModal(false); setLbRegenShotId(null); }}
        />
      )}

      {/* ── Frame Manager ── */}
      {frameMgrShotId && (
        <FrameManager
          shotId={frameMgrShotId}
          onClose={() => setFrameMgrShotId(null)}
          onMutate={mutate}
        />
      )}

      {/* ── Frame Image Lightbox ── */}
      {frameImageLightbox && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 3000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setFrameImageLightbox(null)}
        >
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <button onClick={() => setFrameImageLightbox(null)} style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 6, color: "#fff", fontSize: 20, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,.6)", borderRadius: 6, padding: "6px 12px" }}>
            <span style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>F{frameImageLightbox.frameNumber}</span>
            {frameImageLightbox.description && <span style={{ color: "#fff", fontSize: 12, marginLeft: 8 }}>{frameImageLightbox.description}</span>}
          </div>
          <img
            src={frameImageLightbox.imagePath}
            alt={`Frame ${frameImageLightbox.frameNumber}`}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 48px rgba(0,0,0,.8)" }}
          />
        </div>
      )}

      {/* ── Generate All Characters Modal ── */}
    </div>
  );
}
