"use client";
import { useState } from "react";

type Result = { cleaned: number; byType: Record<string, number> };

export default function CleanupStaleForm() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cleanup-stale", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setResult({ cleaned: d.cleaned ?? 0, byType: d.byType ?? {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        onClick={run}
        disabled={running}
        style={{
          alignSelf: "flex-start",
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 700,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: running ? "rgba(124,58,237,.4)" : "var(--accent)",
          color: "#fff",
          cursor: running ? "wait" : "pointer",
        }}>
        {running ? "Scanning…" : "Clean up stale running generations"}
      </button>
      {result && result.cleaned === 0 && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>✓ No orphans found — DB is clean.</span>
      )}
      {result && result.cleaned > 0 && (
        <span style={{ fontSize: 12, color: "var(--success)" }}>
          ✓ Cleaned {result.cleaned} orphan generation{result.cleaned === 1 ? "" : "s"}
          {Object.keys(result.byType).length > 0 && (
            <> ({Object.entries(result.byType).map(([t, n]) => `${t}: ${n}`).join(", ")})</>
          )}.
        </span>
      )}
      {error && <span style={{ fontSize: 12, color: "var(--accent)" }}>Failed: {error}</span>}
    </div>
  );
}
