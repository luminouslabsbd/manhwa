"use client";
import { useEffect, useState } from "react";

type SecretRow = {
  name: string;
  label: string;
  description: string;
  placeholder: string;
  masked: string;
  source: "db" | "env" | "none";
  updated_at: string | null;
  known: boolean;
};

export default function SecretsForm() {
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/secrets");
      const d = await r.json();
      setRows(d.secrets ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const notify = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  async function save(name: string, value: string, description?: string) {
    const r = await fetch("/api/admin/secrets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, value, description }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { notify("err", d.error || "Save failed"); return false; }
    notify("ok", `${name} saved`);
    await load();
    return true;
  }

  async function remove(name: string) {
    if (!confirm(`Delete DB override for ${name}? Falls back to env var if one is set.`)) return;
    const r = await fetch(`/api/admin/secrets/${encodeURIComponent(name)}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok || d.error) { notify("err", d.error || "Delete failed"); return; }
    notify("ok", `${name} deleted — ${d.fellBackTo === "env" ? "env var still active" : "no value"}`);
    await load();
  }

  async function importFromEnv(overwrite: boolean) {
    const label = overwrite ? "Overwrite DB values with current env?" : "Import env values into DB (keeping existing DB rows)?";
    if (!confirm(label)) return;
    const r = await fetch("/api/admin/secrets/import-env", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overwrite }),
    });
    const d = await r.json();
    if (!r.ok || d.error) { notify("err", d.error || "Import failed"); return; }
    notify("ok", `Imported ${d.imported.length} · kept ${d.skipped.length} · missing ${d.missing.length}`);
    await load();
  }

  if (loading) return <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>;

  const envOnlyCount = rows.filter((r) => r.source === "env").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {envOnlyCount > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
          background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.3)", color: "var(--text)",
          display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
        }}>
          <span>
            <strong>{envOnlyCount}</strong> value{envOnlyCount === 1 ? "" : "s"} currently live in <code>.env</code> only.
            Move them into the DB so the app no longer needs the file after next deploy.
          </span>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button onClick={() => importFromEnv(false)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Import from .env
            </button>
            <button onClick={() => importFromEnv(true)} title="Replaces any DB values with current env values."
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
              Overwrite DB from .env
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          padding: "8px 12px", borderRadius: 6, fontSize: 12,
          background: toast.type === "ok" ? "#dcfce7" : "#fee2e2",
          color: toast.type === "ok" ? "#166534" : "#991b1b",
          border: `1px solid ${toast.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
        }}>{toast.msg}</div>
      )}

      {rows.map((r) => (
        <SecretRowView key={r.name} row={r} onSave={save} onDelete={remove} />
      ))}

      <CustomKeyForm onSave={save} />
    </div>
  );
}

function SecretRowView({ row, onSave, onDelete }: {
  row: SecretRow;
  onSave: (name: string, value: string, desc?: string) => Promise<boolean>;
  onDelete: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const pill = (() => {
    if (row.source === "db") return { bg: "#dcfce7", fg: "#166534", label: "DB override" };
    if (row.source === "env") return { bg: "#dbeafe", fg: "#1e40af", label: "env fallback" };
    return { bg: "#fef3c7", fg: "#92400e", label: "not set" };
  })();

  async function submit() {
    if (!value) return;
    setSaving(true);
    const ok = await onSave(row.name, value);
    setSaving(false);
    if (ok) { setValue(""); setEditing(false); }
  }

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{row.label}</span>
        <code style={{ fontSize: 11, color: "var(--muted)", padding: "1px 6px", borderRadius: 4, background: "rgba(0,0,0,.05)" }}>{row.name}</code>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
          background: pill.bg, color: pill.fg, textTransform: "uppercase", letterSpacing: 0.5,
        }}>{pill.label}</span>
        {row.masked && <code style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{row.masked}</code>}
      </div>
      {row.description && <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.description}</div>}

      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="password"
            autoComplete="off"
            placeholder={row.placeholder || `Paste new ${row.name} value`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setEditing(false); setValue(""); } }}
            style={{
              flex: 1, minWidth: 240,
              padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "monospace",
            }}
          />
          <button onClick={submit} disabled={saving || !value}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "wait" : "pointer", fontSize: 12, fontWeight: 600 }}>
            {saving ? "…" : "Save"}
          </button>
          <button onClick={() => { setEditing(false); setValue(""); }}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setEditing(true)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 11 }}>
            {row.source === "db" ? "Change" : "Set"}
          </button>
          {row.source === "db" && (
            <button onClick={() => onDelete(row.name)}
              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>
              Delete DB override
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CustomKeyForm({ onSave }: { onSave: (name: string, value: string, desc?: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name || !value) return;
    setSaving(true);
    const ok = await onSave(name.trim(), value, description);
    setSaving(false);
    if (ok) { setName(""); setValue(""); setDescription(""); setOpen(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: 6, border: "1px dashed var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
        + Add custom secret
      </button>
    );
  }

  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px dashed var(--accent)", display: "flex", flexDirection: "column", gap: 8 }}>
      <input placeholder="NAME (UPPER_SNAKE_CASE)" value={name}
        onChange={(e) => setName(e.target.value.toUpperCase())}
        style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "monospace" }} />
      <input placeholder="Description (optional)" value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
      <input type="password" autoComplete="off" placeholder="Value" value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "monospace" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={submit} disabled={saving || !name || !value}
          style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "wait" : "pointer", fontSize: 12, fontWeight: 600 }}>
          {saving ? "…" : "Add"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
