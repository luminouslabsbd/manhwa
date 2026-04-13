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
  const data = await gql(
    `query{gpuTypes{id displayName memoryInGb communityCloud communityPrice secureCloud securePrice}}`,
    {},
    20000,
  );
  return (data.gpuTypes ?? []) as GpuType[];
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

export interface CreatePodInput {
  gpuTypeId: string;
  setupScript: string; // base64-encoded pod-setup.sh
  hfToken?: string;
  civitaiToken?: string;
  publicKey?: string;
  ollamaModel?: string;
}

export async function createPod(input: CreatePodInput): Promise<{ id: string }> {
  const {
    gpuTypeId,
    setupScript,
    hfToken = "",
    civitaiToken = "",
    publicKey = "",
    ollamaModel = "qwen2.5:7b",
  } = input;

  // Inline SSH bootstrap + decode+run setup.sh in background
  const dockerCmd = [
    "bash", "-c",
    `apt-get update -qq;`,
    `apt-get install -y -qq openssh-server 2>/dev/null;`,
    `mkdir -p /root/.ssh /run/sshd /workspace;`,
    `echo "${publicKey.replace(/"/g, '\\"')}" > /root/.ssh/authorized_keys;`,
    `chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys;`,
    `echo PermitRootLogin yes >> /etc/ssh/sshd_config;`,
    `/usr/sbin/sshd 2>/dev/null;`,
    `echo $SETUP_SCRIPT | base64 -d > /workspace/setup.sh;`,
    `chmod +x /workspace/setup.sh;`,
    `bash /workspace/setup.sh >> /workspace/setup.log 2>&1 &`,
    `sleep infinity`,
  ].join(" ");

  const envVars = [
    { key: "SETUP_SCRIPT", value: setupScript },
    { key: "HF_TOKEN", value: hfToken },
    { key: "CIVITAI_TOKEN", value: civitaiToken },
    { key: "OLLAMA_MODEL", value: ollamaModel },
  ];

  const envStr = envVars.map((e) => `{key:"${e.key}",value:${JSON.stringify(e.value)}}`).join(",");

  const data = await gql(
    `mutation{podFindAndDeployOnDemand(input:{
      cloudType:COMMUNITY
      gpuTypeId:"${gpuTypeId}"
      gpuCount:1
      containerDiskInGb:30
      volumeInGb:150
      volumeMountPath:"/workspace"
      startJupyter:false
      startSsh:true
      imageName:"nvidia/cuda:12.1.1-devel-ubuntu22.04"
      ports:"8188/http,11434/http,5000/http,22/tcp"
      env:[${envStr}]
      dockerArgs:${JSON.stringify(dockerCmd)}
    }){id imageName machineId}}`,
    {},
    30000,
  );
  return data.podFindAndDeployOnDemand as { id: string };
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
