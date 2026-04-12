"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = { name: string; email: string; role: string };

export default function NavBar({ name, email, role }: Props) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
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
  );
}
