import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRenderJob, updateRenderJob } from "@/lib/db";
import { workerCallbackSchema } from "@/lib/render-job";
import { requireServerVariable } from "@/lib/server-config";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = requireServerVariable("RENDER_WEBHOOK_SECRET");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (!isAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const id = z.uuid().parse((await context.params).id);
    if (!(await getRenderJob(id))) return Response.json({ error: "Not found." }, { status: 404 });
    const input = workerCallbackSchema.parse(await request.json());
    const job = await updateRenderJob(id, {
      status: input.status,
      progress: input.status === "completed" ? 1 : input.progress,
      outputUrl: input.outputUrl,
      error: input.error,
    });
    return Response.json({ ok: true, status: job?.status });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Callback failed." },
      { status },
    );
  }
}
