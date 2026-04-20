import { prisma } from "@/lib/prisma";
import { verifyAdmin } from "@/lib/dal";
import { invalidateSecret } from "@/lib/secrets";

// DELETE /api/admin/secrets/[name] — drop the DB override. After deletion
// `getSecret(name)` falls back to `process.env[name]` again, so a blank
// value here doesn't necessarily mean "no key at all" on this deployment.
export async function DELETE(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  await verifyAdmin();
  const { name } = await params;
  await prisma.appSecret.deleteMany({ where: { name } });
  invalidateSecret(name);
  return Response.json({ ok: true, fellBackTo: process.env[name] ? "env" : "none" });
}
