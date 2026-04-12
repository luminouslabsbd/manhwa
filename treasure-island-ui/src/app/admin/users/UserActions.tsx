"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { userId: string; isActive: boolean; role: string };

export default function UserActions({ userId, isActive, role }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const disabled = loading || role === "SUPERADMIN";

  async function toggle() {
    setLoading(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    });
    router.refresh();
    setLoading(false);
  }

  async function remove() {
    if (!confirm("Delete this user? Their projects will become unassigned.")) return;
    setLoading(true);
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    router.refresh();
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
      <button onClick={toggle} disabled={disabled} className="btn btn-secondary btn-xs"
        title={role === "SUPERADMIN" ? "Cannot modify admin" : undefined}>
        {isActive ? "Disable" : "Enable"}
      </button>
      <button onClick={remove} disabled={disabled} className="btn btn-danger btn-xs"
        title={role === "SUPERADMIN" ? "Cannot delete admin" : undefined}>
        Delete
      </button>
    </div>
  );
}
