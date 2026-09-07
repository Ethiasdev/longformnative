import { z } from "zod";
import { getRenderJob } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = idSchema.safeParse((await context.params).id);
  if (!parsed.success) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  try {
    const job = await getRenderJob(parsed.data);
    if (!job) return Response.json({ error: "Render job not found." }, { status: 404 });
    return Response.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to read render job." },
      { status: 500 },
    );
  }
}
