import { getRunpodJob, runpodJobIdSchema } from "@/lib/runpod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = runpodJobIdSchema.safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  try {
    const job = await getRunpodJob(parsed.data);
    return Response.json(job, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to read RunPod status." },
      { status: 502 },
    );
  }
}
