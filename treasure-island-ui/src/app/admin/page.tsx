import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function AdminDashboard() {
  const [userCount, projectCount, generationCount, activeJobCount] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.generation.count(),
    prisma.generation.count({ where: { status: "running" } }),
  ]);

  const recentUsers = await prisma.user.findMany({
    orderBy: { created_at: "desc" },
    take: 5,
    select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
  });

  const projectsPerUser = await prisma.project.groupBy({
    by: ["user_id"],
    _count: { id: true },
  });

  const stats = [
    { label: "Total Users", value: userCount, href: "/admin/users" },
    { label: "Total Projects", value: projectCount },
    { label: "Total Generations", value: generationCount },
    { label: "Active Jobs", value: activeJobCount },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Admin Dashboard</h1>
        <Link href="/admin/users/new" className="btn btn-primary btn-sm">+ New User</Link>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>{s.label}</p>
            <p style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{s.value}</p>
            {s.href && <Link href={s.href} style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", marginTop: 6, display: "inline-block" }}>View all →</Link>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Recent Users */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Recent Users</h2>
            <Link href="/admin/users" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>View all</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recentUsers.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{u.name}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{u.email}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {u.role === "SUPERADMIN" && (
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(233,69,96,.15)", color: "var(--accent)", border: "1px solid rgba(233,69,96,.3)", fontWeight: 700 }}>Admin</span>
                  )}
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: u.is_active ? "var(--success)" : "var(--border)", display: "inline-block" }} />
                </div>
              </div>
            ))}
            {recentUsers.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No users yet.</p>}
          </div>
        </div>

        {/* Projects by user */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px" }}>Projects by User</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projectsPerUser.map((row) => (
              <div key={row.user_id ?? "unassigned"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{row.user_id ?? "Unassigned"}</span>
                <span style={{ color: "var(--text)", marginLeft: 8 }}>{row._count.id} project{row._count.id !== 1 ? "s" : ""}</span>
              </div>
            ))}
            {projectsPerUser.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No projects yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
