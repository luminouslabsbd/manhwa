"use client";
import { useState } from "react";

type VideoModel = "wan2" | "ltx2";

const MODELS: { value: VideoModel; label: string; description: string; vram: string }[] = [
  {
    value: "ltx2",
    label: "LTX-Video 13B 0.9.7 (distilled)",
    description: "Lightricks step-distilled model — ~8 steps per clip, cfg=1.0. Fast image-to-video with good general quality. This is the only video model installed on new pods.",
    vram: "16–24GB",
  },
];

export default function VideoModelForm({ initial }: { initial: VideoModel }) {
  const [model, setModel] = useState<VideoModel>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");

  async function save(next: VideoModel) {
    setSaving(true);
    setStatus("idle");
    setModel(next);
    const res = await fetch("/api/admin/pods/video-model", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: next }),
    });
    setSaving(false);
    setStatus(res.ok ? "ok" : "err");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {MODELS.map(m => {
        const selected = model === m.value;
        return (
          <label key={m.value} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "14px 16px", borderRadius: 10,
            border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
            background: selected ? "rgba(233,69,96,.08)" : "transparent",
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1,
            transition: "all .12s",
          }}>
            <input
              type="radio" name="videoModel" value={m.value}
              checked={selected}
              disabled={saving}
              onChange={() => save(m.value)}
              style={{ marginTop: 3, accentColor: "var(--accent)" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: selected ? "var(--accent)" : "var(--text)" }}>
                {m.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                {m.description}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, fontFamily: "monospace" }}>
                VRAM: {m.vram}
              </div>
            </div>
          </label>
        );
      })}
      {status === "ok" && <span style={{ fontSize: 12, color: "var(--success)" }}>✓ Saved — new shots will use LTX-Video 0.9.7 distilled.</span>}
      {status === "err" && <span style={{ fontSize: 12, color: "var(--accent)" }}>Save failed.</span>}
    </div>
  );
}
