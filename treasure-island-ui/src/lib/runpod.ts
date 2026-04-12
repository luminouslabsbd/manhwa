const API_KEY = process.env.RUNPOD_API_KEY!;
const GQL = `https://api.runpod.io/graphql?api_key=${API_KEY}`;

async function gql(query: string, variables = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
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

export async function getPodStatus(podId: string) {
  const data = await gql(`query($id:String!){pod(input:{podId:$id}){id name desiredStatus runtime{uptimeInSeconds gpus{id gpuUtilPercent memoryUtilPercent}pods{location{name}}}costPerHr gpuCount}}`, { id: podId });
  return data.pod;
}

export async function startPod(podId: string) {
  const data = await gql(`mutation($id:String!,$gpuCount:Int!){podResume(input:{podId:$id,gpuCount:$gpuCount}){id desiredStatus}}`, { id: podId, gpuCount: 1 });
  return data.podResume;
}

export async function stopPod(podId: string) {
  const data = await gql(`mutation($id:String!){podStop(input:{podId:$id}){id desiredStatus}}`, { id: podId });
  return data.podStop;
}

export function getComfyUIUrl(podId: string) {
  return `https://${podId}-8188.proxy.runpod.net`;
}
