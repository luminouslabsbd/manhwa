import { getPodConfig } from "@/lib/pod-config";
import HostConfigForm from "./HostConfigForm";
import CleanupStaleForm from "./CleanupStaleForm";
import SecretsForm from "./SecretsForm";
import SettingsTabs, { type TabDef } from "./SettingsTabs";

export default async function SettingsPage() {
  const cfg = getPodConfig();

  const initialHosts = {
    comfyuiHost: cfg.comfyuiHost ?? "",
    videoHost:   cfg.videoHost ?? "",
    ollamaHost:  cfg.ollamaHost ?? "",
    ttsHost:     cfg.ttsHost ?? "",
  };

  // The former "Workflows" tab (active-model picker) was merged into
  // /admin/models — each catalog row now has a "Set as active" button that
  // writes the same AppConfig fields. Settings keeps only app-level config
  // that doesn't belong on the per-row catalog view.
  const tabs: TabDef[] = [
    {
      id: "secrets",
      label: "API Keys",
      hint: "Secrets & tokens",
      content: (
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>API Keys &amp; Secrets</h2>
          <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--muted)" }}>
            Stored in <code>app_secrets</code> (preferred) with <code>.env</code> as fallback.
            Rotation takes effect within 30s without restart. Values are only shown masked.
          </p>
          <SecretsForm />
        </div>
      ),
    },
    {
      id: "hosts",
      label: "Hosts",
      hint: "Service URLs",
      content: (
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>Host Configuration</h2>
          <HostConfigForm initial={initialHosts} />
        </div>
      ),
    },
    {
      id: "maintenance",
      label: "Maintenance",
      hint: "Cleanup tools",
      content: (
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Maintenance</h2>
          <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--muted)" }}>
            Sweep orphan generations that got stuck as <code>running</code> after a pod restart or crash.
            Anything older than 15 minutes is marked <code>failed</code> so regeneration is unblocked.
          </p>
          <CleanupStaleForm />
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Settings</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Secrets, host endpoints, and maintenance tools. Per-category active models live in{" "}
          <a href="/admin/models" style={{ color: "var(--accent)" }}>Models</a>.
        </p>
      </div>
      <SettingsTabs tabs={tabs} />
    </div>
  );
}
