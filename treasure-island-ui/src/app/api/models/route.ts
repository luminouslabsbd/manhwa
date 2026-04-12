import { getHost } from "@/lib/comfyui";

export async function GET() {
  try {
    const host = getHost();
    const sig = AbortSignal.timeout(5000);

    const [ckptRes, unetRes, loraRes] = await Promise.all([
      fetch(`${host}/object_info/CheckpointLoaderSimple`, { signal: sig }).then(r => r.json()).catch(() => ({})),
      fetch(`${host}/object_info/UNETLoader`, { signal: sig }).then(r => r.json()).catch(() => ({})),
      fetch(`${host}/object_info/LoraLoader`, { signal: sig }).then(r => r.json()).catch(() => ({})),
    ]);

    const checkpoints: string[] = ckptRes?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
    const unets: string[] = unetRes?.UNETLoader?.input?.required?.unet_name?.[0] ?? [];
    const loras: string[] = loraRes?.LoraLoader?.input?.required?.lora_name?.[0] ?? [];

    // Combine: checkpoints first, then FLUX UNETs (prefixed so callers can detect them)
    const models = [...checkpoints, ...unets];

    return Response.json({ models, checkpoints, unets, loras });
  } catch {
    return Response.json({ models: [], checkpoints: [], unets: [], loras: [] });
  }
}
