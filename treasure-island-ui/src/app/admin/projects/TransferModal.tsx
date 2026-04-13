"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; name: string; email: string };

type Props = {
  projectId: string;
  projectName: string;
  currentOwnerId: string | null;
  users: User[];
};

export default function TransferModal({ projectId, projectName, currentOwnerId, users }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toUserId, setToUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const eligible = users.filter((u) => u.id !== currentOwnerId);

  async function handleTransfer() {
    if (!toUserId) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/projects/${projectId}/transfer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_user_id: toUserId }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Transfer failed");
      return;
    }
    setOpen(false);
    setToUserId("");
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-secondary btn-xs">
        Transfer
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,.6)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="card" style={{ width: 420, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Transfer Project</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Move <strong style={{ color: "var(--text)" }}>{projectName}</strong> to a different user.
              All episodes, shots, and generations stay intact.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Transfer to</label>
              <select
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                style={{
                  background: "var(--input-bg, var(--card))", color: "var(--text)",
                  border: "1px solid var(--border)", borderRadius: 6,
                  padding: "8px 10px", fontSize: 13, width: "100%",
                }}
              >
                <option value="">— Select user —</option>
                {eligible.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
              {eligible.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>No other users available.</p>
              )}
            </div>

            {error && <p style={{ margin: 0, fontSize: 12, color: "var(--accent)" }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setOpen(false)} className="btn btn-secondary btn-sm" disabled={loading}>
                Cancel
              </button>
              <button onClick={handleTransfer} className="btn btn-primary btn-sm" disabled={loading || !toUserId}>
                {loading ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
