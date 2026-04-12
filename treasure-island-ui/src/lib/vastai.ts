const API_KEY = process.env.VASTAI_API_KEY!;
const BASE = "https://console.vast.ai/api/v0";

async function api(path: string, method = "GET", body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getInstance(instanceId: string) {
  const data = await api(`/instances/?owner=me`);
  const instances = data.instances || data;
  if (Array.isArray(instances)) {
    return instances.find((i: Record<string, unknown>) => String(i.id) === instanceId) || null;
  }
  return null;
}

export async function getInstanceStatus(instanceId: string) {
  const inst = await getInstance(instanceId);
  if (!inst) return { status: "NOT_FOUND", running: false };

  const running = inst.actual_status === "running";
  const ports = inst.ports || {};

  // Find ComfyUI port (8188)
  let comfyHost: string | null = null;
  for (const [portKey, mappings] of Object.entries(ports)) {
    if (portKey.startsWith("8188/")) {
      const mapping = (mappings as Array<{ HostIp: string; HostPort: string }>)?.[0];
      if (mapping) {
        comfyHost = `http://${inst.public_ipaddr}:${mapping.HostPort}`;
      }
    }
  }

  return {
    id: inst.id,
    status: inst.actual_status?.toUpperCase() || "UNKNOWN",
    running,
    gpu: inst.gpu_name,
    costPerHr: inst.dph_total || 0,
    uptimeSeconds: Math.round((inst.duration || 0)),
    comfyHost,
    publicIp: inst.public_ipaddr,
    ports,
    sshHost: inst.ssh_host,
    sshPort: inst.ssh_port,
  };
}

export async function startInstance(instanceId: string) {
  return api(`/instances/${instanceId}/`, "PUT", { state: "running" });
}

export async function stopInstance(instanceId: string) {
  return api(`/instances/${instanceId}/`, "PUT", { state: "stopped" });
}

export async function destroyInstance(instanceId: string) {
  return api(`/instances/${instanceId}/`, "DELETE");
}

export function getComfyUIUrl(instanceId: string) {
  // Fallback — will be overridden by actual port mapping from getInstanceStatus
  return process.env.COMFYUI_HOST || `http://localhost:8188`;
}
