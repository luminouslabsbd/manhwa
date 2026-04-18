import Link from "next/link";
import { verifyAdmin } from "@/lib/dal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verifyAdmin();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px", display: "flex", gap: 24 }}>
        {/* Sidebar */}
        <aside style={{ width: 180, flexShrink: 0 }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, padding: "0 10px" }}>Admin</p>
            <NavLink href="/admin">Dashboard</NavLink>
            <NavLink href="/admin/users">Users</NavLink>
            <NavLink href="/admin/projects">Projects</NavLink>
            <NavLink href="/admin/pods">Pods</NavLink>
            <NavLink href="/admin/settings">Settings</NavLink>
            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0" }} />
            <NavLink href="/projects">← Back to Studio</NavLink>
          </nav>
        </aside>
        {/* Main */}
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ display: "block", padding: "7px 10px", borderRadius: 6, fontSize: 13, color: "var(--text)", textDecoration: "none", transition: "background .1s" }}
      onMouseEnter={undefined}
    >
      {children}
    </Link>
  );
}
