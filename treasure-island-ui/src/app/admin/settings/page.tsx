import { getPodConfig } from "@/lib/pod-config";
import { getAppConfig } from "@/lib/app-config";
import HostConfigForm from "./HostConfigForm";
import VideoModelForm from "./VideoModelForm";

export default async function SettingsPage() {
  const cfg = getPodConfig();
  const app = await getAppConfig();

  const initial = {
    comfyuiHost: cfg.comfyuiHost ?? "",
    videoHost:   cfg.videoHost ?? "",
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
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Video Model</h2>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--muted)" }}>
          Model used for the image-to-video step. Pods are provisioned with LTX-Video 0.9.7 distilled only.
        </p>
        <VideoModelForm initial={app.video_model} />
      </div>

      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>Host Configuration</h2>
        <HostConfigForm initial={initial} />
      </div>
    </div>
  );
}
