import { getPresets } from "@/lib/prompt-builder";

export async function GET() {
  return Response.json(getPresets());
}
