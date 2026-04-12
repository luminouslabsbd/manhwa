"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewUserPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password"), role: fd.get("role") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create user"); setLoading(false); return; }
      router.push("/admin/users");
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  const inputStyle = { width: "100%", padding: "9px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 14, outline: "none" };
  const labelStyle = { display: "block" as const, fontSize: 13, fontWeight: 500 as const, color: "var(--text)", marginBottom: 6 };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/admin/users" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← Users</Link>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>New User</h1>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input name="name" required style={inputStyle} placeholder="Jane Doe"
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border)")} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input name="email" type="email" required style={inputStyle} placeholder="jane@example.com"
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border)")} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input name="password" type="password" required minLength={8} style={inputStyle} placeholder="Min. 8 characters"
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border)")} />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select name="role" style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="USER">User</option>
              <option value="SUPERADMIN">Super Admin</option>
            </select>
          </div>

          {error && (
            <div style={{ background: "rgba(233,69,96,.15)", border: "1px solid rgba(233,69,96,.4)", borderRadius: 6, padding: "10px 12px", color: "var(--accent)", fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
              {loading ? <><span className="spinner" /> Creating…</> : "Create User"}
            </button>
            <Link href="/admin/users" className="btn btn-secondary btn-sm">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
