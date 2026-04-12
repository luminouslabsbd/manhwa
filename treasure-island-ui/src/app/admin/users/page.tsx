import { prisma } from "@/lib/prisma";
import Link from "next/link";
import UserActions from "./UserActions";

export default async function UsersPage() {
  const users = await prisma.user.findMany({ orderBy: { created_at: "desc" } });
  const projectCounts = await prisma.project.groupBy({ by: ["user_id"], _count: { id: true } });
  const countMap = Object.fromEntries(projectCounts.map((r) => [r.user_id, r._count.id]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Users</h1>
        <Link href="/admin/users/new" className="btn btn-primary btn-sm">+ New User</Link>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Name", "Email", "Role", "Projects", "Status", "Created", "Actions"].map(h => (
                <th key={h} style={{ textAlign: h === "Actions" ? "right" : "left", padding: "10px 16px", color: "var(--muted)", fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{u.email}</td>
                <td style={{ padding: "12px 16px" }}>
                  {u.role === "SUPERADMIN"
                    ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(233,69,96,.15)", color: "var(--accent)", border: "1px solid rgba(233,69,96,.3)", fontWeight: 700 }}>Admin</span>
                    : <span style={{ color: "var(--muted)" }}>User</span>}
                </td>
                <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{countMap[u.id] ?? 0}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: u.is_active ? "var(--success)" : "var(--muted)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.is_active ? "var(--success)" : "var(--border)", display: "inline-block" }} />
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <UserActions userId={u.id} isActive={u.is_active} role={u.role} />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
