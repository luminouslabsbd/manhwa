const API_KEY = process.env.RUNPOD_API_KEY!;
const GQL = `https://api.runpod.io/graphql?api_key=${API_KEY}`;

async function gql(query: string, variables: Record<string, unknown> = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PodPort = { ip: string; isIpPublic: boolean; privatePort: number; publicPort: number; type: string };
export type PodRuntime = {
  uptimeInSeconds: number;
  gpus: Array<{ id: string; gpuUtilPercent: number; memoryUtilPercent: number }>;
  ports: PodPort[];
};

export interface RunPodPod {
  id: string;
  name: string;
  desiredStatus: string; // "RUNNING" | "EXITED" | "TERMINATED"
  imageName: string;
  costPerHr: number;
  gpuCount: number;
  runtime: PodRuntime | null;
  machine: { gpuDisplayName: string; podHostId: string } | null;
}

export interface GpuType {
  id: string;
  displayName: string;
  memoryInGb: number;
  communityCloud: boolean;
  communityPrice: number | null;
  secureCloud: boolean;
  securePrice: number | null;
  /** Current availability: "High" | "Medium" | "Low" | null (null = no stock). */
  stockStatus?: "High" | "Medium" | "Low" | null;
}

// ── Pod queries ───────────────────────────────────────────────────────────────

export async function getPodStatus(podId: string): Promise<RunPodPod | null> {
  const data = await gql(
    `query($id:String!){pod(input:{podId:$id}){id name desiredStatus imageName costPerHr gpuCount
      runtime{uptimeInSeconds gpus{id gpuUtilPercent memoryUtilPercent}
        ports{ip isIpPublic privatePort publicPort type}}
      machine{gpuDisplayName podHostId}}}`,
    { id: podId },
  );
  return data.pod ?? null;
}

export async function listPods(): Promise<RunPodPod[]> {
  const data = await gql(
    `query{myself{pods{id name desiredStatus imageName costPerHr gpuCount
      runtime{uptimeInSeconds gpus{id gpuUtilPercent memoryUtilPercent}
        ports{ip isIpPublic privatePort publicPort type}}
      machine{gpuDisplayName podHostId}}}}`,
  );
  return (data.myself?.pods ?? []) as RunPodPod[];
}

export async function getGpuTypes(): Promise<GpuType[]> {
  // lowestPrice(input:{gpuCount:1}).stockStatus is RunPod's freshest availability
  // signal — "High" | "Medium" | "Low" | null. null means no host has this GPU.
  const data = await gql(
    `query{gpuTypes{
      id displayName memoryInGb communityCloud communityPrice secureCloud securePrice
      lowestPrice(input:{gpuCount:1}){ stockStatus }
    }}`,
    {},
    20000,
  );
  type Raw = Omit<GpuType, "stockStatus"> & { lowestPrice?: { stockStatus?: GpuType["stockStatus"] } | null };
  const raw = (data.gpuTypes ?? []) as Raw[];
  return raw.map(({ lowestPrice, ...g }) => ({
    ...g,
    stockStatus: lowestPrice?.stockStatus ?? null,
  }));
}

// ── Pod mutations ─────────────────────────────────────────────────────────────

export async function startPod(podId: string) {
  const data = await gql(
    `mutation($id:String!,$gpuCount:Int!){podResume(input:{podId:$id,gpuCount:$gpuCount}){id desiredStatus}}`,
    { id: podId, gpuCount: 1 },
  );
  return data.podResume;
}

export async function stopPod(podId: string) {
  const data = await gql(
    `mutation($id:String!){podStop(input:{podId:$id}){id desiredStatus}}`,
    { id: podId },
  );
  return data.podStop;
}

export async function deletePod(podId: string) {
  const data = await gql(
    `mutation($id:String!){podTerminate(input:{podId:$id})}`,
    { id: podId },
  );
  return data.podTerminate;
}

export interface PodComponents {
  comfyui?: boolean; // ComfyUI + torch + pip (required for sdxl/flux/video)
  tts?: boolean;     // edge-tts Flask server on :5000
  ollama?: boolean;  // Ollama LLM server on :11434
  sdxl?: boolean;    // SDXL checkpoints (animagine + juggernaut, ~10 GB)
  flux?: boolean;    // FLUX.1-schnell + CLIPs + AE VAE (~20 GB)
  video?: boolean;   // Wan 2.1 t2v/i2v models (~20 GB)
}

export interface CreatePodInput {
  gpuTypeId: string;
  setupScript: string; // base64-encoded pod-setup.sh
  hfToken?: string;
  civitaiToken?: string;
  publicKey?: string;
  ollamaModel?: string;
  cloudType?: "COMMUNITY" | "SECURE";
  components?: PodComponents;
}

export class NoCapacityError extends Error {
  constructor(message: string, readonly cloudType: "COMMUNITY" | "SECURE") {
    super(message);
    this.name = "NoCapacityError";
  }
}

export async function createPod(input: CreatePodInput): Promise<{ id: string; cloudType: "COMMUNITY" | "SECURE" }> {
  const {
    gpuTypeId,
    setupScript,
    hfToken = "",
    civitaiToken = "",
    publicKey = "",
    ollamaModel = "qwen2.5:7b",
    cloudType = "COMMUNITY",
    components = {},
  } = input;

  // Default all-on when `components` is empty (back-compat). Otherwise honor
  // exactly what the caller passed, only flipping required deps.
  const hasAny = Object.keys(components).length > 0;
  const comp = hasAny
    ? components
    : { comfyui: true, tts: true, ollama: true, sdxl: true, flux: true, video: true };
  // sdxl/flux/video require ComfyUI to render — auto-enable
  const needComfy = !!(comp.sdxl || comp.flux || comp.video);
  const finalComp = { ...comp, comfyui: comp.comfyui || needComfy };

  // Inline SSH bootstrap + decode+run setup.sh in background.
  // NOTE: the setup.sh launch ends with `&` (background) then `sleep infinity` —
  // `&` already terminates the statement, so no `;` between them.
  const bootstrap = [
    `apt-get update -qq`,
    `apt-get install -y -qq openssh-server 2>/dev/null || true`,
    `mkdir -p /root/.ssh /run/sshd /workspace`,
    `printf '%s\\n' "$PUBLIC_KEY" > /root/.ssh/authorized_keys`,
    `chmod 700 /root/.ssh`,
    `chmod 600 /root/.ssh/authorized_keys`,
    `echo PermitRootLogin yes >> /etc/ssh/sshd_config`,
    `/usr/sbin/sshd 2>/dev/null || true`,
    `printf '%s' "$SETUP_SCRIPT" | base64 -d > /workspace/setup.sh`,
    `chmod +x /workspace/setup.sh`,
    `(bash /workspace/setup.sh >> /workspace/setup.log 2>&1 &)`,
    `exec sleep infinity`,
  ].join("; ");

  const body = {
    name: `ti-${gpuTypeId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20).toLowerCase()}-${Date.now().toString(36)}`,
    imageName: "nvidia/cuda:12.1.1-devel-ubuntu22.04",
    cloudType,
    gpuTypeIds: [gpuTypeId],
    gpuCount: 1,
    containerDiskInGb: 30,
    volumeInGb: 150,
    volumeMountPath: "/workspace",
    ports: ["8188/http", "11434/http", "5000/http", "22/tcp"],
    dockerEntrypoint: ["/bin/bash", "-lc", bootstrap],
    env: {
      SETUP_SCRIPT: setupScript,
      HF_TOKEN: hfToken,
      CIVITAI_TOKEN: civitaiToken,
      OLLAMA_MODEL: ollamaModel,
      PUBLIC_KEY: publicKey,
      INSTALL_COMFYUI: finalComp.comfyui ? "1" : "0",
      INSTALL_TTS:     finalComp.tts     ? "1" : "0",
      INSTALL_OLLAMA:  finalComp.ollama  ? "1" : "0",
      INSTALL_SDXL:    finalComp.sdxl    ? "1" : "0",
      INSTALL_FLUX:    finalComp.flux    ? "1" : "0",
      INSTALL_VIDEO:   finalComp.video   ? "1" : "0",
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch("https://rest.runpod.io/v1/pods", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let json: { id?: string; error?: string; message?: string; errors?: Array<{ message: string }> } = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-json */ }
    if (!res.ok) {
      const msg = json.error || json.message || json.errors?.[0]?.message || text || `HTTP ${res.status}`;
      // RunPod returns one of several phrasings when no machine in the selected
      // cloud has capacity / resources for the requested pod spec.
      if (/does not have the resources|no (instances|machines|available)|currently available|out of stock|no capacity/i.test(msg)) {
        throw new NoCapacityError(msg, cloudType);
      }
      throw new Error(`RunPod: ${msg}`);
    }
    if (!json.id) throw new Error("RunPod: pod created but no id returned");
    return { id: json.id, cloudType };
  } finally {
    clearTimeout(timeout);
  }
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

export function getPodProxyUrls(podId: string) {
  return {
    comfyui: `https://${podId}-8188.proxy.runpod.net`,
    ollama: `https://${podId}-11434.proxy.runpod.net`,
    tts: `https://${podId}-5000.proxy.runpod.net`,
  };
}

export function getComfyUIUrl(podId: string) {
  return `https://${podId}-8188.proxy.runpod.net`;
}

export async function getPodSshInfo(podId: string): Promise<{ ip: string; port: number } | null> {
  const pod = await getPodStatus(podId);
  const ports = pod?.runtime?.ports ?? [];
  const sshPort = ports.find((p) => p.privatePort === 22 && p.type === "tcp");
  if (!sshPort) return null;
  return { ip: sshPort.ip, port: sshPort.publicPort };
}
