"use client";
import { useState, useCallback } from "react";

const fetcher = (url: string) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), 6000);
  return fetch(url, { signal: c.signal }).then(r => r.json()).catch(() => null);
};

type PodData = {
  status?: string; running?: boolean; comfyReady?: boolean;
  costPerHr?: number; uptimeSeconds?: number; gpu?: string;
  queue?: { running: number; pending: number };
  error?: string;
};

export default function PodPanel() {
  const [data, setData] = useState<PodData | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const mutate = useCallback(async () => {
    setLoading(true);
    try { const d = await fetcher("/api/pod/status"); setData(d); } catch {}
    setLoading(false);
  }, []);

  const elapsed = data?.uptimeSeconds ?? 0;
  const cost = ((elapsed / 3600) * (data?.costPerHr ?? 0)).toFixed(3);
  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = Math.floor(elapsed % 60);
  const uptime = `${String(hrs).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;

  async function handleStart() {
    setLoading(true);
    await fetch("/api/pod/start", { method: "POST" });
    setTimeout(() => { mutate(); setLoading(false); }, 3000);
  }

  async function handleStop() {
    if (!confirm) { setConfirm(true); return; }
    setLoading(true);
    await fetch("/api/pod/stop", { method: "POST" });
    setConfirm(false);
    setTimeout(() => { mutate(); setLoading(false); }, 2000);
  }

  const running = data?.running;
  const statusColor = running ? "var(--success)" : data?.status === "UNKNOWN" ? "var(--muted)" : "var(--danger)";

  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 16, borderLeft: `3px solid ${statusColor}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>GPU {data?.gpu ? `· ${data.gpu}` : ""}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, display: "inline-block", boxShadow: running ? `0 0 6px var(--success)` : "none" }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{data?.status ?? "..."}</span>
            </div>
          </div>
          {running && (
            <>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>UPTIME</div>
                <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{uptime}</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>COST</div>
                <div style={{ fontWeight: 700, color: "var(--warning)" }}>${cost}</div>
              </div>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>/hr</div>
                <div style={{ fontWeight: 700 }}>${data?.costPerHr?.toFixed(3)}</div>
              </div>
              {data?.queue && (
                <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 16 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>QUEUE</div>
                  <div style={{ fontWeight: 700 }}>
                    <span style={{ color: "var(--warning)" }}>{data.queue.running}</span> running · <span style={{ color: "var(--muted)" }}>{data.queue.pending}</span> pending
                  </div>
                </div>
              )}
              {!data?.comfyReady && (
                <span style={{ fontSize: 11, color: "var(--warning)" }}>ComfyUI warming up…</span>
              )}
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => mutate()} title="Refresh status">🔄</button>
          {!running ? (
            <button className="btn btn-success btn-sm" onClick={handleStart} disabled={loading}>
              {loading ? <span className="spinner" /> : "▶"} Start Pod
            </button>
          ) : (
            <button
              className={`btn btn-sm ${confirm ? "btn-danger" : "btn-secondary"}`}
              onClick={handleStop} disabled={loading}
              onBlur={() => setConfirm(false)}
            >
              {loading ? <span className="spinner" /> : confirm ? "Confirm Stop" : "Stop Pod"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
