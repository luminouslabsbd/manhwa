import { startPod, getPodStatus } from "@/lib/runpod";
import { verifyAdmin } from "@/lib/dal";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  try {
    const result = await startPod(id);
    return Response.json({ ok: true, result });
  } catch (e) {
    // Pod may not be resumable — return error so UI can offer "create new"
    return Response.json({ ok: false, error: String(e), canCreate: true }, { status: 422 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  const pod = await getPodStatus(id);
  return Response.json({ pod });
}
