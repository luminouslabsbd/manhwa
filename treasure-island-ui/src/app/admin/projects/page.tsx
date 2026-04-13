import { prisma } from "@/lib/prisma";
import TransferModal from "./TransferModal";

export default async function AdminProjectsPage() {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({ orderBy: { created_at: "desc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Projects</h1>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{projects.length} total</span>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Name", "Owner", "Status", "Created", "Actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Actions" ? "right" : "left",
                    padding: "10px 16px",
                    color: "var(--muted)",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const owner = p.user_id ? userMap[p.user_id] : null;
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                    {owner ? (
                      <>
                        <span style={{ color: "var(--text)" }}>{owner.name}</span>
                        <span style={{ marginLeft: 6, fontSize: 11 }}>({owner.email})</span>
                      </>
                    ) : (
                      <span style={{ fontStyle: "italic" }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: p.status === "active" ? "rgba(0,200,100,.12)" : "rgba(255,255,255,.06)",
                        color: p.status === "active" ? "var(--success)" : "var(--muted)",
                        border: `1px solid ${p.status === "active" ? "rgba(0,200,100,.25)" : "var(--border)"}`,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 11 }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <TransferModal
                      projectId={p.id}
                      projectName={p.name}
                      currentOwnerId={p.user_id ?? null}
                      users={users}
                    />
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
