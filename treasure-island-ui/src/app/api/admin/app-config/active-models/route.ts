import { prisma } from "@/lib/prisma";
import { verifyAdmin } from "@/lib/dal";
import { getAppConfig, setAppConfig } from "@/lib/app-config";

// GET /api/admin/app-config/active-models — current active selections plus
// the catalog rows they point at. Used by the Settings page on first render.
export async function GET() {
  await verifyAdmin();
  const cfg = await getAppConfig();
  return Response.json({
    active: {
      image: cfg.active_image_model,
      video: cfg.active_video_model,
      tts: cfg.active_tts_model,
      content: cfg.active_content_model,
    },
  });
}

// PATCH /api/admin/app-config/active-models — update one or more active-model
// pointers. Each value must reference an existing Model row of the matching
// category, otherwise we'd silently leave generation broken.
const FIELD_BY_CATEGORY = {
  image: "active_image_model",
  video: "active_video_model",
  tts: "active_tts_model",
  content: "active_content_model",
} as const;
type Category = keyof typeof FIELD_BY_CATEGORY;

export async function PATCH(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));

  const updates: Partial<Record<Category, string>> = {};
  for (const cat of Object.keys(FIELD_BY_CATEGORY) as Category[]) {
    if (typeof body[cat] === "string" && body[cat]) updates[cat] = body[cat];
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No active-model updates provided" }, { status: 400 });
  }

  // Validate each candidate — refuse the whole batch on the first mismatch
  // so we never half-commit a UI submission.
  const ids = Object.values(updates);
  const found = await prisma.model.findMany({ where: { id: { in: ids } } });
  for (const [cat, modelId] of Object.entries(updates) as [Category, string][]) {
    const m = found.find((x) => x.id === modelId);
    if (!m) return Response.json({ error: `Model "${modelId}" not found in catalog` }, { status: 400 });
    if (m.category !== cat) {
      return Response.json({
        error: `Model "${modelId}" is category "${m.category}", cannot be set as active ${cat}.`,
      }, { status: 400 });
    }
    if (!m.is_enabled) {
      return Response.json({ error: `Model "${modelId}" is disabled — enable it before activating.` }, { status: 400 });
    }
  }

  const patch: Record<string, string> = {};
  for (const [cat, modelId] of Object.entries(updates) as [Category, string][]) {
    patch[FIELD_BY_CATEGORY[cat]] = modelId;
  }
  const cfg = await setAppConfig(patch);
  return Response.json({
    ok: true,
    active: {
      image: cfg.active_image_model,
      video: cfg.active_video_model,
      tts: cfg.active_tts_model,
      content: cfg.active_content_model,
    },
  });
}
