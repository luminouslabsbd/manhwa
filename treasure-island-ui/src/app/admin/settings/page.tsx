import { getPodConfig } from "@/lib/pod-config";
import HostConfigForm from "./HostConfigForm";

export default function SettingsPage() {
  const cfg = getPodConfig();

  const initial = {
    comfyuiHost: cfg.comfyuiHost ?? "",
    ollamaHost:  cfg.ollamaHost ?? "",
    ttsHost:     cfg.ttsHost ?? "",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Settings</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Configure service endpoints for generation. Changes take effect immediately — no restart needed.
        </p>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>Host Configuration</h2>
        <HostConfigForm initial={initial} />
      </div>
    </div>
  );
}
