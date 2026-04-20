import { prisma } from "@/lib/prisma";
import { verifyAdmin } from "@/lib/dal";
import { invalidateSecret, maskSecret, KNOWN_SECRETS } from "@/lib/secrets";

// GET /api/admin/secrets
// Returns the catalog of known secret names + every custom row currently in
// the DB, each with a MASKED value (never the raw secret). An `envFallback`
// flag indicates whether the process.env copy would fill in if DB is empty.
export async function GET() {
  await verifyAdmin();
  const rows = await prisma.appSecret.findMany({ select: { name: true, value: true, description: true, updated_at: true } });
  const rowByName = new Map(rows.map((r) => [r.name, r]));

  const known = KNOWN_SECRETS.map((k) => {
    const row = rowByName.get(k.name);
    const envValue = process.env[k.name] ?? "";
    const hasDb = !!row?.value;
    return {
      name: k.name,
      label: k.label,
      description: k.description,
      placeholder: k.placeholder ?? "",
      masked: hasDb ? maskSecret(row!.value) : (envValue ? maskSecret(envValue) : ""),
      source: hasDb ? "db" : envValue ? "env" : "none",
      updated_at: row?.updated_at ?? null,
      known: true,
    };
  });

  const customRows = rows
    .filter((r) => !KNOWN_SECRETS.find((k) => k.name === r.name))
    .map((r) => ({
      name: r.name,
      label: r.name,
      description: r.description,
      placeholder: "",
      masked: maskSecret(r.value),
      source: "db" as const,
      updated_at: r.updated_at,
      known: false,
    }));

  return Response.json({ secrets: [...known, ...customRows] });
}

// PATCH /api/admin/secrets
// Body: { name: string, value: string, description?: string }
// Upserts the row and invalidates the in-memory cache so rotation takes
// effect within 30s (next getSecret call re-reads).
export async function PATCH(req: Request) {
  await verifyAdmin();
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const value = String(body.value ?? "");
  const description = typeof body.description === "string" ? body.description : undefined;

  if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return Response.json({ error: "name must be UPPER_SNAKE_CASE (letters, digits, underscores; starts with a letter)" }, { status: 400 });
  }
  if (!value) {
    return Response.json({ error: "value is required — use DELETE to remove a key" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row = await prisma.appSecret.upsert({
    where: { name },
    update: { value, ...(description !== undefined ? { description } : {}), updated_at: now },
    create: { name, value, description: description ?? "", updated_at: now },
  });
  invalidateSecret(name);

  return Response.json({
    ok: true,
    secret: { name: row.name, masked: maskSecret(row.value), updated_at: row.updated_at, source: "db" },
  });
}
