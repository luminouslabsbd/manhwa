import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { getSessionForApi } from "@/lib/dal";

export async function POST() {
  const session = await getSessionForApi();
  if (!session?.impersonator) {
    return Response.json({ error: "Not impersonating" }, { status: 400 });
  }

  const admin = await prisma.user.findUnique({ where: { id: session.impersonator.userId } });
  if (!admin || admin.role !== "SUPERADMIN") {
    return Response.json({ error: "Original admin no longer exists or is not admin" }, { status: 403 });
  }

  await createSession({
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: "SUPERADMIN",
  });

  return Response.json({ ok: true });
}
