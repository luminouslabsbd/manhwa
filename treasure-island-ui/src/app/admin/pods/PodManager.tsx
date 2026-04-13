"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PodConfig, VideoQualityPreset } from "@/lib/pod-config";

type RunPodPod = {
  id: string;
  name: string;
  desiredStatus: string;
  imageName: string;
  costPerHr: number;
  gpuCount: number;
  runtime: {
    uptimeInSeconds: number;
    gpus: Array<{ id: string; gpuUtilPercent: number; memoryUtilPercent: number }>;
    ports: Array<{ ip: string; isIpPublic: boolean; privatePort: number; publicPort: number; type: string }>;
  } | null;
  machine: { gpuDisplayName: string; podHostId: string } | null;
};

type GpuType = {
  id: string;
  displayName: string;
  memoryInGb: number;
  communityCloud: boolean;
  communityPrice: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function statusColor(status: string) {
  if (status === "RUNNING") return "#22c55e";
  if (status === "EXITED" || status === "STOPPED") return "#ef4444";
  return "#6b7280";
}

function statusDot(status: string) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: statusColor(status), marginRight: 6, flexShrink: 0,
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PodManager({ initialConfig }: { initialConfig: PodConfig }) {
  const [pods, setPods] = useState<RunPodPod[]>([]);
  const [gpuTypes, setGpuTypes] = useState<GpuType[]>([]);
  const [config, setConfig] = useState<PodConfig>(initialConfig);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // podId being acted on
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const loadPods = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/pods");
      const d = await r.json();
      setPods(d.pods ?? []);
      setGpuTypes(d.gpuTypes ?? []);
    } catch {
      setMsg({ text: "Failed to load pods", type: "err" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPods(); }, [loadPods]);

  const toast = (text: string, type: "ok" | "err" = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const podAction = async (podId: string, action: "start" | "stop" | "delete" | "set-host") => {
    setBusy(podId);
    try {
      if (action === "delete" && !confirm(`Delete pod ${podId}? This cannot be undone.`)) {
        setBusy(null);
        return;
      }
      const method = action === "delete" ? "DELETE" : "POST";
      const url = action === "delete"
        ? `/api/admin/pods/${podId}`
        : `/api/admin/pods/${podId}/${action}`;
      const r = await fetch(url, { method });
      const d = await r.json();
      if (!r.ok || d.error) {
        if (action === "start" && d.canCreate) {
          toast(`Cannot start pod — it may be terminated. Create a new one instead.`, "err");
        } else {
          toast(d.error || "Action failed", "err");
        }
      } else {
        if (action === "set-host") {
          setConfig((c) => ({ ...c, activePodId: podId, comfyuiHost: d.comfyui, ollamaHost: d.ollama, ttsHost: d.tts }));
          toast(`Active host set to ${podId}`);
        } else {
          toast(`${action} successful`);
        }
        await loadPods();
      }
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Pod Management</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
            RunPod GPU instances — manage, create, and assign active host
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadPods} disabled={loading}
            style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
            {loading ? "..." : "Refresh"}
          </button>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            + New Pod
          </button>
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: msg.type === "ok" ? "#dcfce7" : "#fee2e2",
          color: msg.type === "ok" ? "#166534" : "#991b1b", border: `1px solid ${msg.type === "ok" ? "#bbf7d0" : "#fecaca"}` }}>
          {msg.text}
        </div>
      )}

      {/* Active Host Banner */}
      <ActiveHostCard config={config} />

      {/* Pod List */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Your Pods</h2>
        {loading && pods.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</p>
        ) : pods.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No pods found. Create one to get started.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pods.map((pod) => (
              <PodRow
                key={pod.id}
                pod={pod}
                isActive={config.activePodId === pod.id}
                isBusy={busy === pod.id}
                onAction={(action) => podAction(pod.id, action)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Idle Stop Settings */}
      <IdleSettings config={config} onUpdate={(c) => setConfig((prev) => ({ ...prev, ...c }))} />

      {/* Video Quality Preset */}
      <VideoQualitySettings config={config} onUpdate={(c) => setConfig((prev) => ({ ...prev, ...c }))} />

      {/* Create Pod Modal */}
      {showCreate && (
        <CreatePodWizard
          gpuTypes={gpuTypes}
          onClose={() => setShowCreate(false)}
          onCreated={async (podId) => {
            setShowCreate(false);
            toast(`Pod ${podId} created! Setup is running in background.`);
            await loadPods();
          }}
        />
      )}
    </div>
  );
}

// ── Active Host Card ──────────────────────────────────────────────────────────

function ActiveHostCard({ config }: { config: PodConfig }) {
  return (
    <div style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-secondary, #f9fafb)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        Active Host
      </div>
      {config.activePodId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Pod: {config.activePodId}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 2 }}>
            <span>ComfyUI: {config.comfyuiHost ?? "—"}</span>
            <span>Ollama: {config.ollamaHost ?? "—"}</span>
            <span>TTS: {config.ttsHost ?? "—"}</span>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          No active host selected. Click "Set as Host" on a running pod.
        </p>
      )}
    </div>
  );
}

// ── Pod Row ───────────────────────────────────────────────────────────────────

function PodRow({
  pod, isActive, isBusy, onAction,
}: {
  pod: RunPodPod;
  isActive: boolean;
  isBusy: boolean;
  onAction: (action: "start" | "stop" | "delete" | "set-host") => void;
}) {
  const isRunning = pod.desiredStatus === "RUNNING";
  const [showLog, setShowLog] = useState(false);

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10, border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
      background: isActive ? "rgba(99,102,241,0.04)" : "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Status + info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {statusDot(pod.desiredStatus)}
            <span style={{ fontWeight: 600, fontSize: 14 }}>{pod.name || pod.id}</span>
            <code style={{ fontSize: 11, color: "var(--muted)", background: "var(--border)", padding: "1px 6px", borderRadius: 4 }}>{pod.id}</code>
            {isActive && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                ACTIVE HOST
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>{pod.machine?.gpuDisplayName ?? "GPU"}</span>
            {pod.costPerHr > 0 && <span>${pod.costPerHr.toFixed(2)}/hr</span>}
            {pod.runtime && <span>Up {fmtUptime(pod.runtime.uptimeInSeconds)}</span>}
            {pod.runtime?.gpus?.[0] && (
              <span>GPU {pod.runtime.gpus[0].gpuUtilPercent}% | VRAM {pod.runtime.gpus[0].memoryUtilPercent}%</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isRunning ? (
            <>
              {!isActive && (
                <Btn onClick={() => onAction("set-host")} disabled={isBusy} color="var(--accent)">
                  Set as Host
                </Btn>
              )}
              <Btn onClick={() => setShowLog((v) => !v)} disabled={false} color="#6b7280">
                {showLog ? "Hide Log" : "View Log"}
              </Btn>
              <Btn onClick={() => onAction("stop")} disabled={isBusy} color="#ef4444">
                {isBusy ? "..." : "Stop"}
              </Btn>
            </>
          ) : (
            <>
              <Btn onClick={() => onAction("start")} disabled={isBusy} color="#22c55e">
                {isBusy ? "..." : "Start"}
              </Btn>
              <Btn onClick={() => onAction("delete")} disabled={isBusy} color="#ef4444">
                Delete
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* Log viewer */}
      {showLog && isRunning && <LogViewer podId={pod.id} />}
    </div>
  );
}

function Btn({ onClick, disabled, color, children }: { onClick: () => void; disabled: boolean; color: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${color}`, color, background: "transparent", cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500, opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
}

// ── Log Viewer (SSE) ──────────────────────────────────────────────────────────

function LogViewer({ podId }: { podId: string }) {
  const [lines, setLines] = useState<string[]>(["Connecting..."]);
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines(["Connecting..."]);
    setDone(false);
    const controller = new AbortController();

    fetch(`/api/admin/pods/${podId}/log`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.replace(/^data: /, "");
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.done) { setDone(true); return; }
              if (msg.line) setLines((prev) => {
                const next = prev[0] === "Connecting..." ? [msg.line] : [...prev, msg.line];
                return next.slice(-500); // keep last 500 lines
              });
            } catch { /* ignore parse errors */ }
          }
        }
      })
      .catch(() => setLines((prev) => [...prev, "[disconnected]"]));

    return () => controller.abort();
  }, [podId]);

  // Auto-scroll
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div ref={ref} style={{
      marginTop: 12, padding: 12, borderRadius: 6, background: "#0f172a", color: "#e2e8f0",
      fontFamily: "monospace", fontSize: 11, lineHeight: 1.6,
      maxHeight: 320, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
    }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
      {done && <div style={{ color: "#4ade80", marginTop: 4 }}>— setup complete —</div>}
    </div>
  );
}

// ── Create Pod Wizard ─────────────────────────────────────────────────────────

function CreatePodWizard({
  gpuTypes, onClose, onCreated,
}: {
  gpuTypes: GpuType[];
  onClose: () => void;
  onCreated: (podId: string) => void;
}) {
  const [step, setStep] = useState<"select" | "creating" | "done">("select");
  const [selectedGpu, setSelectedGpu] = useState<GpuType | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setAsHost, setSetAsHost] = useState(true);

  // Default GPU options if API returned nothing
  const defaultGpus: GpuType[] = [
    { id: "NVIDIA A100 80GB PCIe", displayName: "A100 80GB PCIe", memoryInGb: 80, communityCloud: true, communityPrice: 1.19 },
    { id: "NVIDIA A100-SXM4-80GB", displayName: "A100 80GB SXM", memoryInGb: 80, communityCloud: true, communityPrice: 2.19 },
    { id: "NVIDIA RTX 4090", displayName: "RTX 4090 24GB", memoryInGb: 24, communityCloud: true, communityPrice: 0.69 },
    { id: "NVIDIA GeForce RTX 3090", displayName: "RTX 3090 24GB", memoryInGb: 24, communityCloud: true, communityPrice: 0.49 },
  ];
  const options = gpuTypes.length > 0
    ? gpuTypes.filter((g) => g.memoryInGb >= 24).slice(0, 8)
    : defaultGpus;

  const createPod = async () => {
    if (!selectedGpu) return;
    setStep("creating");
    setError(null);
    try {
      const r = await fetch("/api/admin/pods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gpuTypeId: selectedGpu.id }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Create failed");
      const podId = d.pod?.id;
      setCreatedId(podId);
      setStep("done");

      // Optionally set as active host immediately
      if (setAsHost && podId) {
        await fetch(`/api/admin/pods/${podId}/set-host`, { method: "POST" });
      }
      onCreated(podId);
    } catch (e) {
      setError(String(e));
      setStep("select");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "var(--bg)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520,
        boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Create New Pod</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {step === "select" && (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
              Select a GPU type. The pod will install ComfyUI, Wan 2.1, and all models automatically.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {options.map((gpu) => (
                <label key={gpu.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 8, border: `2px solid ${selectedGpu?.id === gpu.id ? "var(--accent)" : "var(--border)"}`,
                  cursor: "pointer", background: selectedGpu?.id === gpu.id ? "rgba(99,102,241,0.05)" : "transparent",
                }}>
                  <input type="radio" name="gpu" value={gpu.id}
                    checked={selectedGpu?.id === gpu.id}
                    onChange={() => setSelectedGpu(gpu)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{gpu.displayName}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{gpu.memoryInGb}GB VRAM · Community Cloud</div>
                  </div>
                  {gpu.communityPrice && (
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      ~${gpu.communityPrice.toFixed(2)}/hr
                    </div>
                  )}
                </label>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={setAsHost} onChange={(e) => setSetAsHost(e.target.checked)} />
              Set as active host after creation
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={createPod} disabled={!selectedGpu}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: selectedGpu ? "var(--accent)" : "var(--border)", color: selectedGpu ? "#fff" : "var(--muted)", cursor: selectedGpu ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}>
                Create Pod →
              </button>
            </div>
          </>
        )}

        {step === "creating" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚙️</div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Creating pod on RunPod...</p>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              GPU: {selectedGpu?.displayName}<br />
              This may take 30–60 seconds.
            </p>
          </div>
        )}

        {step === "done" && createdId && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Pod created!</p>
            <code style={{ fontSize: 12, color: "var(--muted)" }}>{createdId}</code>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 0" }}>
              Setup is running in the background (~10–15 min for model downloads).
              Use "View Log" on the pod to monitor progress.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Video Quality Settings ────────────────────────────────────────────────────

const VIDEO_PRESETS: { id: VideoQualityPreset; label: string; detail: string }[] = [
  { id: "fast",     label: "Fast",     detail: "16fps · ~4s · 20 steps — quick preview" },
  { id: "balanced", label: "Balanced", detail: "24fps · ~4s · 25 steps — good quality" },
  { id: "smooth",   label: "Smooth",   detail: "24fps · ~4s · 30 steps — best quality" },
];

function VideoQualitySettings({ config, onUpdate }: { config: PodConfig; onUpdate: (c: Partial<PodConfig>) => void }) {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<VideoQualityPreset>(config.videoQualityPreset ?? "balanced");

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/pods/video-preset", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: selected }),
      });
      const d = await r.json();
      if (d.ok) onUpdate({ videoQualityPreset: d.preset });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 18, borderRadius: 10, border: "1px solid var(--border)" }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Video Quality Preset</h2>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>
        Default quality used for all video generation. Higher quality = longer render time.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {VIDEO_PRESETS.map((p) => (
          <label key={p.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            borderRadius: 8, border: `2px solid ${selected === p.id ? "var(--accent)" : "var(--border)"}`,
            cursor: "pointer", background: selected === p.id ? "rgba(99,102,241,0.05)" : "transparent",
          }}>
            <input type="radio" name="videoPreset" value={p.id}
              checked={selected === p.id}
              onChange={() => setSelected(p.id)}
              style={{ accentColor: "var(--accent)" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.detail}</div>
            </div>
            {selected === p.id && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>ACTIVE</span>
            )}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Idle Settings ─────────────────────────────────────────────────────────────

function IdleSettings({ config, onUpdate }: { config: PodConfig; onUpdate: (c: Partial<PodConfig>) => void }) {
  const [saving, setSaving] = useState(false);
  const [minutes, setMinutes] = useState(config.idleStopMinutes);
  const [enabled, setEnabled] = useState(config.idleStopEnabled);
  const [checkResult, setCheckResult] = useState<Record<string, unknown> | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/pods/idle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, minutes }),
      });
      const d = await r.json();
      onUpdate({ idleStopEnabled: d.enabled, idleStopMinutes: d.minutes });
    } finally {
      setSaving(false);
    }
  };

  const checkNow = async () => {
    const r = await fetch("/api/admin/pods/idle/check");
    const d = await r.json();
    setCheckResult(d);
  };

  const lastActivity = config.lastActivityAt
    ? new Date(config.lastActivityAt).toLocaleString()
    : "Never detected";

  return (
    <div style={{ padding: 18, borderRadius: 10, border: "1px solid var(--border)" }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 14px" }}>Auto-Stop (Idle)</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Auto-stop pod when idle</span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13 }}>Stop after</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)" }}>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
          <span style={{ fontSize: 13 }}>of idle time</span>
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Last activity: {lastActivity}
          {config.lastIdleCheckAt && (
            <> · Last check: {new Date(config.lastIdleCheckAt).toLocaleString()}</>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
          <button onClick={save} disabled={saving}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={checkNow}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12 }}>
            Check Now
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Run <code>bash scripts/idle-monitor.sh</code> to enable automated checks
          </span>
        </div>

        {checkResult && (
          <div style={{ padding: 10, borderRadius: 6, background: "var(--border)", fontSize: 12, fontFamily: "monospace" }}>
            {JSON.stringify(checkResult, null, 2).split("\n").map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
