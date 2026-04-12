"use client";
import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/projects";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed"); setLoading(false); return; }
      router.push(data.role === "SUPERADMIN" ? "/admin" : from);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "0 16px" }}>
        <div className="card" style={{ padding: 32 }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 12, background: "var(--accent)", fontSize: 22, marginBottom: 12 }}>◈</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", margin: 0 }}>Manhwa Studio</h1>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>Email</label>
              <input
                name="email" type="email" required autoComplete="email"
                style={{ width: "100%", padding: "9px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 14, outline: "none" }}
                placeholder="you@example.com"
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 6 }}>Password</label>
              <input
                name="password" type="password" required autoComplete="current-password"
                style={{ width: "100%", padding: "9px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 14, outline: "none" }}
                placeholder="••••••••"
                onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>

            {error && (
              <div style={{ background: "rgba(233,69,96,.15)", border: "1px solid rgba(233,69,96,.4)", borderRadius: 6, padding: "10px 12px", color: "var(--accent)", fontSize: 13 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}>
              {loading ? <><span className="spinner" /> Signing in…</> : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
