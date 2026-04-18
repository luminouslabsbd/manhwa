import { NextRequest } from "next/server";
import { getPodConfig, savePodConfig } from "@/lib/pod-config";

export async function GET() {
  const cfg = getPodConfig();
  return Response.json({
    comfyuiHost: cfg.comfyuiHost ?? "",
    ollamaHost: cfg.ollamaHost ?? "",
    ttsHost: cfg.ttsHost ?? "",
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const updates: Record<string, string | undefined> = {};

  if (typeof body.comfyuiHost === "string") updates.comfyuiHost = body.comfyuiHost.trim() || undefined;
  if (typeof body.ollamaHost === "string") updates.ollamaHost = body.ollamaHost.trim() || undefined;
  if (typeof body.ttsHost === "string") updates.ttsHost = body.ttsHost.trim() || undefined;

  const saved = savePodConfig(updates);
  return Response.json({
    comfyuiHost: saved.comfyuiHost ?? "",
    ollamaHost: saved.ollamaHost ?? "",
    ttsHost: saved.ttsHost ?? "",
  });
}
