import "server-only";
import { prisma } from "@/lib/prisma";
import { getAppConfig } from "@/lib/app-config";
import { resolveTtsHost } from "@/lib/pod-config";

/**
 * Resolve the URL the TTS dispatcher should POST to.
 *
 * Resolution order:
 *   1. `AppConfig.active_tts_model` → catalog row → row.host (if set)
 *      This is the catalog-driven path: the admin picks "Coqui XTTS v2" in
 *      /admin/settings → Workflows, then sets the row's host to
 *      `https://<pod>-5001.proxy.runpod.net` in /admin/models.
 *   2. Legacy `pod-config.ttsHost` (what the old "Set as Host" menu writes).
 *      This still works for single-engine pods where every TTS route
 *      terminates on port 5000.
 *
 * Multi-engine pods need path 1 — different TTS engines live on different
 * ports (5000/5001/5002/5003) on the same pod, and the generic ttsHost only
 * encodes one of them.
 */
export async function resolveActiveTtsHost(): Promise<string> {
  try {
    const cfg = await getAppConfig();
    const modelId = cfg.active_tts_model;
    if (modelId) {
      const row = await prisma.model.findUnique({
        where: { id: modelId },
        select: { host: true, category: true, is_enabled: true },
      });
      if (row?.category === "tts" && row.is_enabled && row.host) {
        return row.host.replace(/\/$/, "");
      }
    }
  } catch {
    // DB unreachable / column missing — fall through to legacy host.
  }
  return resolveTtsHost().replace(/\/$/, "");
}
