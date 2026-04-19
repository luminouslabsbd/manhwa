"use client";
import { useState } from "react";

type HostConfig = {
  comfyuiHost: string;
  videoHost: string;
  ollamaHost: string;
  ttsHost: string;
};

const PLACEHOLDERS: Record<keyof HostConfig, string> = {
  comfyuiHost: "http://localhost:8188",
  videoHost:   "(falls back to ComfyUI Host)",
  ollamaHost:  "http://localhost:11434",
  ttsHost:     "http://localhost:5000",
};

const ENVFALLBACKS: Record<keyof HostConfig, string> = {
  comfyuiHost: "COMFYUI_HOST → http://localhost:8188",
  videoHost:   "falls back to ComfyUI Host, then VIDEO_HOST / COMFYUI_HOST env",
  ollamaHost:  "OLLAMA_HOST → http://localhost:11434",
  ttsHost:     "TTS_HOST → http://localhost:5000",
};

export default function HostConfigForm({ initial }: { initial: HostConfig }) {
  const [form, setForm] = useState<HostConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");

  function set(key: keyof HostConfig, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    const res = await fetch("/api/admin/settings/hosts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrMsg(d.error ?? "Save failed");
      setStatus("err");
    } else {
      setStatus("ok");
    }
  }

  const sections: { key: keyof HostConfig; label: string; description: string }[] = [
    {
      key: "comfyuiHost",
      label: "ComfyUI Host (Image)",
      description: "ComfyUI server used for image generation (SDXL / FLUX workflows).",
    },
    {
      key: "videoHost",
      label: "ComfyUI Host (Video)",
      description: "Optional: ComfyUI server used for video workflows (WAN 2.1). Leave empty to reuse the image host.",
    },
    {
      key: "ttsHost",
      label: "TTS Host",
      description: "XTTS v2 Flask server for speech synthesis.",
    },
    {
      key: "ollamaHost",
      label: "Ollama Host",
      description: "Ollama LLM server for prompt generation and story AI.",
    },
  ];

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {sections.map(({ key, label, description }) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontWeight: 700, fontSize: 14 }}>{label}</label>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{description}</p>
          <input
            type="url"
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
            placeholder={PLACEHOLDERS[key]}
            style={{
              background: "var(--input-bg, var(--card))",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "monospace",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <p style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>
            Fallback if empty: <code style={{ fontSize: 11 }}>{ENVFALLBACKS[key]}</code>
          </p>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {status === "ok" && (
          <span style={{ fontSize: 13, color: "var(--success)" }}>Saved successfully.</span>
        )}
        {status === "err" && (
          <span style={{ fontSize: 13, color: "var(--accent)" }}>{errMsg}</span>
        )}
      </div>
    </form>
  );
}
