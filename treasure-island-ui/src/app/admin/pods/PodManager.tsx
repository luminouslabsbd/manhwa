"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PodConfig, PodService, VideoQualityPreset } from "@/lib/pod-config";

type ServiceSelection = "all" | PodService[];

const SERVICE_LABELS: Record<PodService, string> = {
  image: "Image (ComfyUI)",
  video: "Video (ComfyUI)",
  tts: "TTS",
  ollama: "Ollama",
};

const SERVICE_ORDER: PodService[] = ["image", "video", "tts", "ollama"];

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
  secureCloud?: boolean;
  securePrice?: number | null;
  stockStatus?: "High" | "Medium" | "Low" | null;
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

function CompCheckbox({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function StockBadge({ level }: { level: GpuType["stockStatus"] }) {
  if (!level) return null;
  const colors: Record<string, { bg: string; fg: string }> = {
    High:   { bg: "#dcfce7", fg: "#166534" },
    Medium: { bg: "#fef3c7", fg: "#92400e" },
    Low:    { bg: "#fee2e2", fg: "#991b1b" },
  };
  const c = colors[level] ?? colors.Low;
  return (
    <span title={`Availability: ${level}`} style={{
      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
      background: c.bg, color: c.fg, textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {level} stock
    </span>
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
      if (d.errors?.gpuTypes) {
        setMsg({ text: `GPU list unavailable: ${d.errors.gpuTypes}`, type: "err" });
      } else if (d.errors?.pods) {
        setMsg({ text: `Pod list unavailable: ${d.errors.pods}`, type: "err" });
      } else {
        setMsg(null);
      }
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

  const podAction = async (podId: string, action: "start" | "stop" | "delete") => {
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
        toast(`${action} successful`);
        await loadPods();
      }
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy(null);
    }
  };

  const setHost = async (podId: string, selection: ServiceSelection) => {
    setBusy(podId);
    try {
      const r = await fetch(`/api/admin/pods/${podId}/set-host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: selection }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        toast(d.error || "Failed to set host", "err");
        return;
      }
      setConfig((c) => ({
        ...c,
        activePodId: d.activePodId ?? c.activePodId,
        activeImagePodId: d.activeImagePodId,
        activeVideoPodId: d.activeVideoPodId,
        activeOllamaPodId: d.activeOllamaPodId,
        activeTtsPodId: d.activeTtsPodId,
        comfyuiHost: d.comfyui,
        videoHost: d.video,
        ollamaHost: d.ollama,
        ttsHost: d.tts,
      }));
      const names = (selection === "all" ? SERVICE_ORDER : selection)
        .map((s) => SERVICE_LABELS[s as PodService]).join(", ");
      toast(`${names} → ${podId}`);
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
            {pods.map((pod) => {
              const activeServices: PodService[] = [];
              if (config.activeImagePodId  === pod.id) activeServices.push("image");
              if (config.activeVideoPodId  === pod.id) activeServices.push("video");
              if (config.activeTtsPodId    === pod.id) activeServices.push("tts");
              if (config.activeOllamaPodId === pod.id) activeServices.push("ollama");
              return (
                <PodRow
                  key={pod.id}
                  pod={pod}
                  activeServices={activeServices}
                  isBusy={busy === pod.id}
                  onAction={(action) => podAction(pod.id, action)}
                  onSetHost={(sel) => setHost(pod.id, sel)}
                />
              );
            })}
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
  const rows: { service: PodService; podId?: string; host?: string }[] = [
    { service: "image",  podId: config.activeImagePodId,  host: config.comfyuiHost },
    { service: "video",  podId: config.activeVideoPodId,  host: config.videoHost ?? config.comfyuiHost },
    { service: "tts",    podId: config.activeTtsPodId,    host: config.ttsHost },
    { service: "ollama", podId: config.activeOllamaPodId, host: config.ollamaHost },
  ];
  const anySet = rows.some((r) => r.podId || r.host);

  return (
    <div style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg2, rgba(255,255,255,.03))" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        Active Hosts (per service)
      </div>
      {anySet ? (
        <div style={{ display: "grid", gridTemplateColumns: "140px auto 1fr", rowGap: 8, columnGap: 12, alignItems: "center", fontSize: 13 }}>
          {rows.map((r) => (
            <ServiceHostRow key={r.service} label={SERVICE_LABELS[r.service]} podId={r.podId} host={r.host} />
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          No active host selected. Use the &quot;Set as Host ▾&quot; menu on a running pod — pick &quot;All services&quot; or route a specific service (Image/Video, TTS, or Ollama) to that pod.
        </p>
      )}
    </div>
  );
}

function ServiceHostRow({ label, podId, host }: { label: string; podId?: string; host?: string }) {
  const hasHost = !!host;
  return (
    <>
      <span style={{ fontWeight: 600, color: "var(--text)" }}>{label}</span>
      <code style={{
        fontSize: 11,
        background: podId ? "rgba(167,139,250,.15)" : "rgba(255,255,255,.06)",
        color: podId ? "#a78bfa" : "var(--muted)",
        padding: "2px 8px", borderRadius: 4, fontWeight: 700,
        border: "1px solid " + (podId ? "rgba(167,139,250,.3)" : "var(--border)"),
      }}>
        {podId ?? "—"}
      </code>
      {hasHost ? (
        <a href={host} target="_blank" rel="noreferrer"
          style={{
            color: "#60a5fa", textDecoration: "none", wordBreak: "break-all",
            fontFamily: "monospace", fontSize: 12, fontWeight: 500,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"; }}
          title={`Open ${host} in a new tab`}>
          {host} ↗
        </a>
      ) : (
        <span style={{ color: "var(--muted)" }}>—</span>
      )}
    </>
  );
}

// ── Pod Row ───────────────────────────────────────────────────────────────────

function PodRow({
  pod, activeServices, isBusy, onAction, onSetHost,
}: {
  pod: RunPodPod;
  activeServices: PodService[];
  isBusy: boolean;
  onAction: (action: "start" | "stop" | "delete") => void;
  onSetHost: (services: ServiceSelection) => void;
}) {
  const isRunning = pod.desiredStatus === "RUNNING";
  const isActive = activeServices.length > 0;
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
            {activeServices.map((s) => (
              <span key={s} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 4 }}>
                {SERVICE_LABELS[s]}
              </span>
            ))}
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
              <SetHostMenu
                disabled={isBusy}
                activeServices={activeServices}
                onSelect={(sel) => onSetHost(sel)}
              />
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

      {/* Readiness strip — only for running pods. When a pod is assigned to
          specific services we only probe those, so a TTS-only pod doesn't
          light up red for ComfyUI being absent. */}
      {isRunning && <PodHealthStrip podId={pod.id} activeServices={activeServices} />}

      {/* Log viewer */}
      {showLog && isRunning && <LogViewer podId={pod.id} />}
    </div>
  );
}

// ── Pod Health Strip ─────────────────────────────────────────────────────────
// Polls /api/admin/pods/[id]/health every 10s and shows per-service status +
// clickable URLs so the user can tell when models are ready for testing.

type Probe = { up: boolean; ms: number; error?: string };
type HealthData = {
  urls: { comfyui: string; ollama: string; tts: string };
  services: { comfyui: Probe; ollama: Probe; tts: Probe };
  models: { loaded: boolean; checkpointCount: number };
};

function PodHealthStrip({ podId, activeServices }: { podId: string; activeServices: PodService[] }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  // Which services we actually care about for this pod. A pod that hasn't been
  // assigned to anything is still probed in full so the operator can see what
  // it's capable of before deciding its role.
  const services = activeServices.length > 0 ? activeServices : (["image", "video", "tts", "ollama"] as PodService[]);
  const showComfy = services.includes("image") || services.includes("video");
  const showTts = services.includes("tts");
  const showOllama = services.includes("ollama");
  const servicesKey = services.slice().sort().join(",");

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const qs = new URLSearchParams({ services: servicesKey }).toString();
        const r = await fetch(`/api/admin/pods/${podId}/health?${qs}`, { cache: "no-store" });
        const d = await r.json();
        if (!cancel) setData(d);
      } catch {
        // swallow — the strip just stays stale on a transient network blip
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 10000);
    return () => { cancel = true; clearInterval(iv); };
  }, [podId, servicesKey]);

  if (loading && !data) {
    return (
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
        Checking services…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={{
      marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.03)",
      display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 12,
    }}>
      {showComfy  && <HealthPill label="ComfyUI" probe={data.services.comfyui} url={data.urls.comfyui} />}
      {showTts    && <HealthPill label="TTS"     probe={data.services.tts}     url={data.urls.tts} />}
      {showOllama && <HealthPill label="Ollama"  probe={data.services.ollama}  url={data.urls.ollama} />}
      {showComfy && (
        <span style={{
          padding: "2px 8px", borderRadius: 999, fontWeight: 600,
          background: data.models.loaded ? "#dcfce7" : "#fef3c7",
          color: data.models.loaded ? "#166534" : "#92400e",
        }}>
          {data.models.loaded
            ? `Models ready (${data.models.checkpointCount} ckpts)`
            : "Models downloading…"}
        </span>
      )}
    </div>
  );
}

function HealthPill({ label, probe, url }: { label: string; probe: Probe; url: string }) {
  const color = probe.up ? "#22c55e" : "#ef4444";
  const title = probe.up ? `${label} reachable (${probe.ms}ms) — click to open` : `${label} down: ${probe.error ?? "unreachable"}`;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "inherit" }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--muted)", fontSize: 11 }}>
        {probe.up ? `${probe.ms}ms` : "down"}
      </span>
    </a>
  );
}

function SetHostMenu({
  disabled, activeServices, onSelect,
}: {
  disabled: boolean;
  activeServices: PodService[];
  onSelect: (services: ServiceSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (sel: ServiceSelection) => {
    setOpen(false);
    onSelect(sel);
  };

  const options: { label: string; sel: ServiceSelection; service?: PodService }[] = [
    { label: "All services", sel: "all" },
    ...SERVICE_ORDER.map((s) => ({ label: SERVICE_LABELS[s], sel: [s] as PodService[], service: s })),
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)}
        style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid var(--accent)`, color: "var(--accent)", background: "transparent", cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500, opacity: disabled ? 0.6 : 1 }}>
        Set as Host ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 10, minWidth: 200,
          background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {options.map((opt, i) => {
            const isCurrent = opt.service ? activeServices.includes(opt.service) : false;
            return (
              <button key={i} type="button" onClick={() => pick(opt.sel)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent",
                  border: "none", borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  cursor: "pointer", fontSize: 12, color: "var(--text)",
                }}>
                <span>{opt.label}</span>
                {isCurrent && <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
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
  const [canRetrySecure, setCanRetrySecure] = useState(false);

  // Filters
  const [minVram, setMinVram] = useState(24);
  const [maxPrice, setMaxPrice] = useState(2.0);
  const [hideLowStock, setHideLowStock] = useState(false);
  const [cloudFilter, setCloudFilter] = useState<"any" | "community" | "secure">("any");

  // Components to install. Derived "need comfyui" flag is auto-set when any model group is on.
  type Components = { comfyui: boolean; tts: boolean; ollama: boolean; sdxl: boolean; flux: boolean; video: boolean };
  const [comp, setComp] = useState<Components>({ comfyui: true, tts: true, ollama: true, sdxl: true, flux: true, video: true });
  const effComfy = comp.comfyui || comp.sdxl || comp.flux || comp.video;
  const applyPreset = (preset: "ollama_tts" | "image_sdxl" | "image_flux" | "video" | "full") => {
    const presets: Record<string, Components> = {
      ollama_tts:  { comfyui: false, tts: true, ollama: true,  sdxl: false, flux: false, video: false },
      image_sdxl:  { comfyui: true,  tts: true, ollama: true,  sdxl: true,  flux: false, video: false },
      image_flux:  { comfyui: true,  tts: true, ollama: true,  sdxl: false, flux: true,  video: false },
      video:       { comfyui: true,  tts: true, ollama: true,  sdxl: false, flux: false, video: true },
      full:        { comfyui: true,  tts: true, ollama: true,  sdxl: true,  flux: true,  video: true },
    };
    setComp(presets[preset]);
  };

  const options = [...gpuTypes]
    .filter((g) => g.memoryInGb >= minVram)
    .filter((g) => {
      if (cloudFilter === "community") return !!(g.communityPrice && g.communityPrice > 0);
      if (cloudFilter === "secure") return !!(g.securePrice && g.securePrice > 0);
      return !!((g.communityPrice && g.communityPrice > 0) || (g.securePrice && g.securePrice > 0));
    })
    .filter((g) => {
      const price = cloudFilter === "secure"
        ? (g.securePrice ?? Infinity)
        : (g.communityPrice ?? g.securePrice ?? Infinity);
      return price <= maxPrice;
    })
    .filter((g) => !hideLowStock || g.stockStatus === "High" || g.stockStatus === "Medium")
    .sort((a, b) => {
      const ap = cloudFilter === "secure" ? (a.securePrice ?? 0) : (a.communityPrice ?? a.securePrice ?? 0);
      const bp = cloudFilter === "secure" ? (b.securePrice ?? 0) : (b.communityPrice ?? b.securePrice ?? 0);
      return ap - bp;
    });

  const createPod = async (cloudType: "COMMUNITY" | "SECURE" = "COMMUNITY") => {
    if (!selectedGpu) return;
    setStep("creating");
    setError(null);
    setCanRetrySecure(false);
    try {
      const r = await fetch("/api/admin/pods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpuTypeId: selectedGpu.id,
          cloudType,
          components: { ...comp, comfyui: effComfy },
        }),
      });
      const text = await r.text();
      let d: {
        error?: string;
        pod?: { id: string; cloudType?: string };
        canRetrySecure?: boolean;
        noCapacity?: boolean;
      } = {};
      try {
        d = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text?.slice(0, 300) || `HTTP ${r.status}`);
      }
      if (!r.ok || d.error) {
        if (d.canRetrySecure) setCanRetrySecure(true);
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const podId = d.pod?.id;
      if (!podId) throw new Error("Pod created but no id returned");
      setCreatedId(podId);
      setStep("done");

      // Optionally set as active host immediately
      if (setAsHost) {
        await fetch(`/api/admin/pods/${podId}/set-host`, { method: "POST" });
      }
      onCreated(podId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        maxHeight: "90vh", overflowY: "auto",
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
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>
              Select a GPU ({options.length} in stock). Pod auto-installs ComfyUI, Wan 2.1, and all models.
            </p>
            <details style={{ margin: "0 0 14px", fontSize: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--muted)" }}>What's Community vs Secure cloud?</summary>
              <div style={{ padding: "8px 10px", marginTop: 6, borderRadius: 6, background: "rgba(0,0,0,0.03)", lineHeight: 1.5 }}>
                <b>Community Cloud</b> — GPUs hosted by individual providers. Cheaper (often 30–50% less), but capacity/uptime varies and machines may be interrupted.<br />
                <b>Secure Cloud</b> — RunPod's own datacenters. More expensive, but guaranteed uptime and consistent performance. Used automatically as fallback if Community has no capacity.
              </div>
            </details>
            {/* Filters */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 12px",
              borderRadius: 8, background: "rgba(0,0,0,0.03)", marginBottom: 12, fontSize: 12, alignItems: "center",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Min VRAM
                <select value={minVram} onChange={(e) => setMinVram(Number(e.target.value))}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12, background: "var(--bg)" }}>
                  <option value={0}>Any</option>
                  <option value={10}>10GB+</option>
                  <option value={16}>16GB+</option>
                  <option value={24}>24GB+</option>
                  <option value={40}>40GB+</option>
                  <option value={80}>80GB+</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Max $/hr
                <input type="number" min={0.1} max={10} step={0.1} value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value) || 10)}
                  style={{ width: 60, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12, background: "var(--bg)" }} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Cloud
                <select value={cloudFilter} onChange={(e) => setCloudFilter(e.target.value as "any" | "community" | "secure")}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12, background: "var(--bg)" }}>
                  <option value="any">Any</option>
                  <option value="community">Community only</option>
                  <option value="secure">Secure only</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={hideLowStock} onChange={(e) => setHideLowStock(e.target.checked)} />
                Hide low stock
              </label>
              <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
                {options.length} of {gpuTypes.length} match
              </span>
            </div>

            {options.length === 0 && (
              <div style={{ padding: 12, borderRadius: 8, background: "#fef3c7", color: "#92400e", fontSize: 13, marginBottom: 12 }}>
                No GPUs match your filters. Loosen them above, or refresh in a minute if <code>RUNPOD_API_KEY</code> may have stalled.
              </div>
            )}

            {/* Component picker — presets + per-component checkboxes */}
            <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Components to install
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {[
                  { id: "ollama_tts", label: "Ollama + TTS",    hint: "~5 GB · 3 min"  },
                  { id: "image_sdxl", label: "Image (SDXL)",    hint: "~20 GB · 15 min" },
                  { id: "image_flux", label: "Image (FLUX)",    hint: "~30 GB · 20 min" },
                  { id: "video",      label: "Video (Wan 2.1)", hint: "~30 GB · 20 min" },
                  { id: "full",       label: "Everything",      hint: "~70 GB · 30 min" },
                ].map((p) => (
                  <button key={p.id} type="button"
                    onClick={() => applyPreset(p.id as "ollama_tts" | "image_sdxl" | "image_flux" | "video" | "full")}
                    title={p.hint}
                    style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 12 }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 12 }}>
                <CompCheckbox label="Ollama (LLM)"             checked={comp.ollama} onChange={(v) => setComp((c) => ({ ...c, ollama: v }))} />
                <CompCheckbox label="TTS (edge-tts)"           checked={comp.tts}    onChange={(v) => setComp((c) => ({ ...c, tts: v }))} />
                <CompCheckbox label="ComfyUI base (auto if models)" checked={effComfy} disabled={comp.sdxl || comp.flux || comp.video}
                  onChange={(v) => setComp((c) => ({ ...c, comfyui: v }))} />
                <CompCheckbox label="SDXL models (~10 GB)"     checked={comp.sdxl}   onChange={(v) => setComp((c) => ({ ...c, sdxl: v }))} />
                <CompCheckbox label="FLUX models (~20 GB)"     checked={comp.flux}   onChange={(v) => setComp((c) => ({ ...c, flux: v }))} />
                <CompCheckbox label="Wan 2.1 video (~20 GB)"   checked={comp.video}  onChange={(v) => setComp((c) => ({ ...c, video: v }))} />
              </div>
            </div>
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
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      {gpu.displayName}
                      <StockBadge level={gpu.stockStatus} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {gpu.memoryInGb}GB VRAM
                    </div>
                  </div>
                  <div style={{ fontSize: 12, textAlign: "right", lineHeight: 1.5 }}>
                    {gpu.communityPrice && gpu.communityPrice > 0 && (
                      <div><b>${gpu.communityPrice.toFixed(2)}</b>/hr <span style={{ color: "var(--muted)" }}>Community</span></div>
                    )}
                    {gpu.securePrice != null && gpu.securePrice > 0 && (
                      <div style={{ color: "var(--muted)" }}>${gpu.securePrice.toFixed(2)}/hr Secure</div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={setAsHost} onChange={(e) => setSetAsHost(e.target.checked)} />
              Set as active host after creation
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
                Cancel
              </button>
              {canRetrySecure && selectedGpu?.securePrice && (
                <button onClick={() => createPod("SECURE")}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #f59e0b", background: "transparent", color: "#b45309", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  Retry on Secure (${selectedGpu.securePrice.toFixed(2)}/hr)
                </button>
              )}
              <button onClick={() => createPod("COMMUNITY")} disabled={!selectedGpu}
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
