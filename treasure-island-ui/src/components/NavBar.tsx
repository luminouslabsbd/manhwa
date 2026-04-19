"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Impersonator = { userId: string; name: string; email: string };
type Props = { name: string; email: string; role: string; impersonator?: Impersonator };

export default function NavBar({ name, email: _email, role, impersonator }: Props) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function stopImpersonating() {
    const res = await fetch("/api/admin/stop-impersonating", { method: "POST" });
    if (!res.ok) {
      alert("Failed to stop impersonating");
      return;
    }
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <>
      {impersonator && (
        <div style={{ background: "#f59e0b", color: "#1a1a2e", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 13, fontWeight: 600 }}>
          <span>Logged in as <strong>{name}</strong> · Impersonated by {impersonator.name}</span>
          <button onClick={stopImpersonating} style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #1a1a2e", background: "transparent", color: "#1a1a2e", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Exit Impersonation
          </button>
        </div>
      )}
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--bg2)", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/projects" style={{ fontWeight: 800, fontSize: 16, color: "var(--accent)", textDecoration: "none", letterSpacing: -0.5 }}>◈ Manhwa Studio</Link>
            {role === "SUPERADMIN" && (
              <Link href="/admin" style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(233,69,96,.15)", color: "var(--accent)", textDecoration: "none", border: "1px solid rgba(233,69,96,.3)", fontWeight: 600 }}>
                Admin
              </Link>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{name}</span>
            <button onClick={logout} className="btn btn-secondary btn-xs">Sign out</button>
          </div>
        </div>
      </header>
    </>
  );
}
