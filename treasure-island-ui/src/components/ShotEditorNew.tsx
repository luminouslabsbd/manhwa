"use client";
import { useState, useEffect, useRef } from "react";
import useSWR from "swr";

const fetcher = (u: string) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), 8000);
  return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null);
};

type Shot = {
  id: string;
  shot_number: number;
  character: string | null;
  shot_description: string;
  environment: string;
  lighting: string;
  camera_angle: string;
  full_prompt: string;
  negative_prompt: string;
  seed: number | null;
  width: number;
  height: number;
  steps: number;
  status: string;
  approved_image_id: string | null;
  approved_video_id: string | null;
  latest_image: string | null;
  latest_video: string | null;
  story_line: string | null;
  dialogue: string | null;
  anchor: string | null;
  audio_path: string | null;
  video_audio_path: string | null;
  project_id: string;
};

type Generation = {
  id: string;
  type: string;
  status: string;
  image_path: string | null;
  video_path: string | null;
  audio_path: string | null;
  error: string | null;
  created_at: string;
};

const VOICES = [
  { id: "default", label: "Auto (Random)" },
  { id: "female_1", label: "Female #1" },
  { id: "female_2", label: "Female #2" },
  { id: "male_1", label: "Male #1" },
  { id: "male_2", label: "Male #2" },
  { id: "child", label: "Child" },
];

export default function ShotEditorNew({ shot, onClose, onSaved }: {
  shot: Shot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dialogue, setDialogue] = useState(shot.dialogue || "");
  const [selectedVoice, setSelectedVoice] = useState("male_1");
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [merging, setMerging] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0); // in ms
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch generations for this shot
  const { data: detail, mutate: mutateDetail } = useSWR(`/api/shots/${shot.id}`, fetcher, { refreshInterval: audioGenerating || videoGenerating ? 2000 : 0 });
  const gens: Generation[] = detail?.generations ?? [];
  const currentShot: Shot = detail?.shot || shot;

  // Get latest states
  const latestAudio = gens.find(g => g.type === "tts" && g.status === "completed");
  const latestVideo = gens.find(g => g.type === "video" && g.status === "completed");
  const videoInProgress = gens.find(g => g.type === "video" && g.status === "running");

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioGenerating || videoGenerating || merging) {
        mutateDetail();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [audioGenerating, videoGenerating, merging, mutateDetail]);

  // Auto-trigger merge when video + audio both ready
  useEffect(() => {
    async function attemptMerge() {
      if (
        latestVideo?.status === "completed" &&
        latestVideo.video_path &&
        latestAudio?.audio_path &&
        !currentShot.video_audio_path &&
        !merging
      ) {
        setMerging(true);
        try {
          const res = await fetch(`/api/shots/${shot.id}/merge-audio-video`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (res.ok) {
            await mutateDetail();
          }
        } catch (err) {
          console.error("Auto-merge failed:", err);
        } finally {
          setMerging(false);
        }
      }
    }

    attemptMerge();
  }, [latestVideo?.status, latestVideo?.video_path, latestAudio?.audio_path, currentShot.video_audio_path, merging, mutateDetail, shot.id]);

  async function generateAudio() {
    if (!dialogue.trim()) {
      setError("Please enter dialogue");
      return;
    }

    setError(null);
    setAudioGenerating(true);
    try {
      const res = await fetch(`/api/shots/${shot.id}/generate-tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dialogue: dialogue.trim(),
          voice: selectedVoice,
          language: "en",
          speed: 1.0,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "TTS generation failed");
      }

      const data = await res.json();
      setAudioDuration(data.duration_ms || 0);

      await mutateDetail();

      // Auto-trigger video generation after 1 second
      setTimeout(() => {
        generateVideo(data.duration_ms);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Audio generation failed";
      setError(msg);
      console.error("TTS generation failed:", err);
    } finally {
      setAudioGenerating(false);
    }
  }

  async function generateVideo(ttsAudioDurationMs?: number) {
    if (!currentShot.approved_image_id) {
      setError("Need approved image first");
      return;
    }

    setError(null);
    setVideoGenerating(true);
    try {
      // Use provided TTS duration or fall back to stored duration or default
      const duration = ttsAudioDurationMs || audioDuration || 0;
      const durationFrames = duration > 0 ? Math.ceil((duration / 1000) * 24) : 144; // 144 frames = 6 seconds at 24fps

      const res = await fetch(`/api/shots/${shot.id}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationFrames,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Video generation failed");
      }

      await mutateDetail();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Video generation failed";
      setError(msg);
      console.error("Video generation failed:", err);
    } finally {
      setVideoGenerating(false);
    }
  }

  async function approve() {
    if (!latestVideo?.id) {
      setError("No video to approve");
      return;
    }

    try {
      const res = await fetch(`/api/shots/${shot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_video_id: latestVideo.id }),
      });

      if (!res.ok) {
        throw new Error("Failed to approve video");
      }

      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      setError(msg);
      console.error("Approval failed:", err);
    }
  }

  // Styles
  const stageContainer = {
    padding: "20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg1)",
  };

  const stageHeader = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  };

  const stageNumber = {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--accent)",
    minWidth: "30px",
  };

  const stageTitle = {
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
  };

  const stageBadge = (status: string) => ({
    fontSize: "11px",
    fontWeight: 600,
    padding: "4px 8px",
    borderRadius: "4px",
    background: status === "ready" ? "#10b98122" : status === "generating" ? "#f59e0b22" : "#ef444422",
    color: status === "ready" ? "#10b981" : status === "generating" ? "#f59e0b" : "#ef4444",
  });

  const primaryBtn = {
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 600,
    border: "none",
    borderRadius: "6px",
    background: "var(--accent)",
    color: "white",
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const secondaryBtn = {
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 600,
    border: "1px solid var(--border)",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.9)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "900px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#ef444422",
              borderBottom: "1px solid #ef4444",
              color: "#ef4444",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>⚠️ {error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#ef4444",
                fontSize: "16px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              Shot {String(shot.shot_number).padStart(2, "0")}
            </h2>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
              {shot.shot_description}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "var(--muted)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content - 4 Stage Pipeline */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: "var(--bg0)",
          }}
        >
          {/* Stage 1: Dialogue */}
          <div style={stageContainer}>
            <div style={stageHeader}>
              <span style={stageNumber}>1️⃣</span>
              <h3 style={stageTitle}>Dialogue</h3>
              <span style={stageBadge("ready")}>Ready</span>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                Character Speech
              </label>
              <textarea
                value={dialogue}
                onChange={(e) => setDialogue(e.target.value)}
                maxLength={150}
                style={{
                  width: "100%",
                  minHeight: "80px",
                  padding: "10px",
                  fontSize: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  background: "var(--bg2)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  resize: "none",
                }}
                placeholder="Enter dialogue (auto-extracted from story)"
              />
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  marginTop: "4px",
                }}
              >
                {dialogue.length}/150 characters
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                Voice
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  background: "var(--bg2)",
                  color: "var(--text)",
                }}
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={generateAudio}
              disabled={audioGenerating || !dialogue.trim()}
              style={{
                ...primaryBtn,
                opacity: audioGenerating || !dialogue.trim() ? 0.6 : 1,
                cursor: audioGenerating || !dialogue.trim() ? "not-allowed" : "pointer",
              }}
            >
              {audioGenerating ? "🔄 Generating Audio..." : "🔊 Generate Audio"}
            </button>
          </div>

          {/* Stage 2: Audio */}
          <div style={stageContainer}>
            <div style={stageHeader}>
              <span style={stageNumber}>2️⃣</span>
              <h3 style={stageTitle}>Audio (TTS)</h3>
              <span
                style={stageBadge(
                  latestAudio ? "ready" : audioGenerating ? "generating" : "pending"
                )}
              >
                {latestAudio ? "✅ Ready" : audioGenerating ? "⏳ Generating..." : "⏳ Pending"}
              </span>
            </div>

            {latestAudio && latestAudio.audio_path ? (
              <>
                <audio
                  ref={audioRef}
                  src={latestAudio.audio_path}
                  style={{ display: "none" }}
                  onPlay={() => setAudioPlaying(true)}
                  onPause={() => setAudioPlaying(false)}
                  onTimeUpdate={(e) => {
                    const curr = e.currentTarget.currentTime || 0;
                    const dur = e.currentTarget.duration || 1;
                    setAudioProgress((curr / dur) * 100);
                  }}
                />

                <div
                  style={{
                    padding: "12px",
                    background: "var(--bg2)",
                    borderRadius: "6px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={() => {
                        if (!audioRef.current) return;
                        if (audioPlaying) {
                          audioRef.current.pause();
                        } else {
                          audioRef.current.play();
                        }
                      }}
                      style={{
                        background: "var(--accent)",
                        border: "none",
                        color: "white",
                        width: "36px",
                        height: "36px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {audioPlaying ? "⏸" : "▶"}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={audioProgress}
                      onChange={(e) => {
                        if (!audioRef.current) return;
                        const prog = Number(e.currentTarget.value) / 100;
                        audioRef.current.currentTime = prog * (audioRef.current.duration || 0);
                        setAudioProgress(Number(e.currentTarget.value));
                      }}
                      style={{ flex: 1, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--muted)", minWidth: "50px" }}>
                      {(audioDuration / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ fontSize: "12px" }}>
                    <span style={{ color: "var(--muted)" }}>Voice:</span>{" "}
                    <span style={{ fontWeight: 600 }}>{selectedVoice}</span>
                  </div>
                  <div style={{ fontSize: "12px" }}>
                    <span style={{ color: "var(--muted)" }}>Duration:</span>{" "}
                    <span style={{ fontWeight: 600 }}>{(audioDuration / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              </>
            ) : audioGenerating ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>🎙️</div>
                <p style={{ color: "var(--muted)" }}>Generating audio...</p>
              </div>
            ) : null}
          </div>

          {/* Stage 3: Video */}
          <div style={stageContainer}>
            <div style={stageHeader}>
              <span style={stageNumber}>3️⃣</span>
              <h3 style={stageTitle}>Video (Wan 2.1)</h3>
              <span
                style={stageBadge(
                  latestVideo?.status === "completed" ? "ready" : videoInProgress ? "generating" : "pending"
                )}
              >
                {latestVideo?.status === "completed" ? "✅ Ready" : videoInProgress ? "⏳ Rendering..." : "⏳ Pending"}
              </span>
            </div>

            {latestVideo?.status === "completed" && latestVideo.video_path ? (
              <div
                style={{
                  background: "var(--bg2)",
                  borderRadius: "6px",
                  padding: "12px",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: "13px",
                }}
              >
                ✅ Video generated (720p, {(audioDuration / 1000).toFixed(1)}s @ 24fps)
              </div>
            ) : videoInProgress || (latestVideo?.status === "running") ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>🎬</div>
                <p style={{ color: "var(--muted)" }}>Rendering video...</p>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
                  This may take 2-5 minutes depending on duration
                </p>
              </div>
            ) : latestAudio ? (
              <p style={{ color: "var(--muted)", fontSize: "12px" }}>
                Will auto-start after audio generation is confirmed
              </p>
            ) : null}
          </div>

          {/* Stage 4: Final */}
          <div style={stageContainer}>
            <div style={stageHeader}>
              <span style={stageNumber}>4️⃣</span>
              <h3 style={stageTitle}>Final (Audio + Video)</h3>
              <span
                style={stageBadge(
                  currentShot.video_audio_path ? "ready" : merging || (latestVideo && latestAudio) ? "generating" : "pending"
                )}
              >
                {currentShot.video_audio_path
                  ? "✅ Ready"
                  : merging || (latestVideo && latestAudio)
                    ? "⏳ Processing..."
                    : "⏳ Pending"}
              </span>
            </div>

            {currentShot.video_audio_path ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button style={primaryBtn} onClick={approve}>
                  ✅ Approve & Lock
                </button>
                <button style={secondaryBtn}>📥 Download</button>
                <button style={secondaryBtn}>🔄 Regenerate</button>
              </div>
            ) : latestVideo?.video_path && latestAudio?.audio_path ? (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>🔀</div>
                <p style={{ color: "var(--muted)" }}>Auto-merging audio + video...</p>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
                  This should complete in 10-20 seconds
                </p>
              </div>
            ) : latestVideo?.status === "completed" ? (
              <p style={{ color: "var(--muted)", fontSize: "12px" }}>
                Waiting for audio to complete before merging
              </p>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "16px 20px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            {audioGenerating
              ? "🎙️ Generating audio..."
              : videoInProgress || (latestVideo?.status === "running")
                ? "🎬 Rendering video..."
                : latestVideo?.video_path && latestAudio?.audio_path && !currentShot.video_audio_path
                  ? "🔀 Merging audio + video..."
                  : "✓ Ready"}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onClose} style={secondaryBtn}>
              Close
            </button>
            <button
              onClick={() => onSaved()}
              style={{
                ...primaryBtn,
                opacity: !currentShot.video_audio_path ? 0.6 : 1,
                cursor: !currentShot.video_audio_path ? "not-allowed" : "pointer",
              }}
              disabled={!currentShot.video_audio_path}
            >
              Next Shot →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
