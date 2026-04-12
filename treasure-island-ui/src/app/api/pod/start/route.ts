import { startInstance } from "@/lib/vastai";

const INSTANCE_ID = process.env.VASTAI_INSTANCE_ID || "";

export async function POST() {
  if (!INSTANCE_ID) return Response.json({ error: "No VASTAI_INSTANCE_ID configured" }, { status: 400 });
  try {
    const result = await startInstance(INSTANCE_ID);
    return Response.json({ ok: true, result });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
