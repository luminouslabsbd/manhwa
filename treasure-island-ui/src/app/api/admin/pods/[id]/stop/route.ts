import { stopPod } from "@/lib/runpod";
import { verifyAdmin } from "@/lib/dal";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await verifyAdmin();
  const { id } = await params;
  try {
    const result = await stopPod(id);
    return Response.json({ ok: true, result });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
