import { prisma } from "@/lib/prisma";
import { verifyAdmin } from "@/lib/dal";
import { KNOWN_SECRETS, invalidateSecret } from "@/lib/secrets";

/**
 * POST /api/admin/secrets/import-env
 *
 * One-shot helper that copies every KNOWN_SECRETS entry currently in
 * `process.env` into the `app_secrets` table, so the admin can fully
 * decommission the `.env` file going forward. Safe to re-run — existing
 * rows are preserved (we never overwrite a DB value with an env value).
 *
 * Body: `{ overwrite?: boolean }` — if true, DB rows get replaced by env
 * when an env value exists. Default false.
 */
export async function POST(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));
  const overwrite = !!body.overwrite;

  const existing = await prisma.appSecret.findMany({ select: { name: true, value: true } });
  const existingByName = new Map(existing.map((r) => [r.name, r.value]));

  const imported: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];
  const now = new Date().toISOString();

  for (const known of KNOWN_SECRETS) {
    const envValue = process.env[known.name] ?? "";
    if (!envValue) { missing.push(known.name); continue; }

    const dbValue = existingByName.get(known.name);
    if (dbValue && !overwrite) { skipped.push(known.name); continue; }

    await prisma.appSecret.upsert({
      where: { name: known.name },
      update: { value: envValue, description: known.description, updated_at: now },
      create: { name: known.name, value: envValue, description: known.description, updated_at: now },
    });
    invalidateSecret(known.name);
    imported.push(known.name);
  }

  return Response.json({
    ok: true,
    imported,
    skipped,  // DB already had a value, left untouched (use overwrite=true to replace)
    missing,  // no env var set, nothing to import
  });
}
