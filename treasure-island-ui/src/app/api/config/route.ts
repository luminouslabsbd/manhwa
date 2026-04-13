export async function GET() {
  return Response.json({
    default_model: process.env.COMFYUI_MODEL ?? null,
  });
}
