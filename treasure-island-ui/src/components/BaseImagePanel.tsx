"use client";
import { useState, useRef, useCallback, useMemo } from "react";
import useSWR from "swr";
import { toast } from "@/lib/toast";

const fetcher = (u: string) => fetch(u).then(r => r.json()).catch(() => null);

export default function BaseImagePanel({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR(`/api/projects/${projectId}/base-image`, fetcher, { revalidateOnFocus: false });
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { toast("Enter a prompt for the base image", "warning"); return; }
    setLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/base-image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      mutate();
    } catch (e) { toast("Error: " + e, "error"); }
    setLoading(false);
  }, [prompt, projectId, mutate]);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("prompt", prompt || "uploaded base image");
    try {
      await fetch(`/api/projects/${projectId}/base-image`, { method: "POST", body: fd });
      mutate();
    } catch (e) { toast("Error: " + e, "error"); }
    setLoading(false);
  }, [prompt, projectId, mutate]);

  const baseImagePath = data?.base_image_path;
  const isGenerating = !baseImagePath && data?.base_image_prompt;
  // Stable cache-buster: only changes when the path itself changes, not every render
  const imgSrc = useMemo(() => baseImagePath ? `${baseImagePath}?t=${Date.now()}` : null, [baseImagePath]);

  return (
    <div className="card" style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🎨</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Base Reference Image</h3>
        {baseImagePath && <span className="badge" style={{ background: "var(--success)", color: "#fff", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>Active</span>}
      </div>

      {baseImagePath ? (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "2px solid var(--accent)", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc!} alt="Base" style={{ width: 200, height: 120, objectFit: "cover" }} />
          </div>
          <div style={{ flex: 1, fontSize: 12 }}>
            <div style={{ color: "var(--muted)", marginBottom: 4 }}>Prompt</div>
            <div style={{ color: "var(--text)", marginBottom: 8, lineHeight: 1.4 }}>{data?.base_image_prompt || "—"}</div>
            <div style={{ color: "var(--muted)", marginBottom: 4 }}>Seed: {data?.base_image_seed ?? "—"}</div>
            <div style={{ color: "var(--muted)", marginBottom: 8 }}>ComfyUI: {data?.base_image_comfyui || "—"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm("Replace base image?")) { setPrompt(data?.base_image_prompt || ""); mutate(); } }}>🔄 Replace</button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {isGenerating && (
            <div style={{ padding: "12px 16px", background: "var(--bg2)", borderRadius: 8, marginBottom: 12, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="spinner" style={{ width: 14, height: 14 }} /> Generating base image...
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input type="text" placeholder="Describe the visual style for this project..." value={prompt} onChange={e => setPrompt(e.target.value)}
              style={{ flex: 1, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", color: "var(--text)", fontSize: 12 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "⚡"} Generate Base Image
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={loading}>
              📁 Upload Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
