import { createRenderRequestSchema } from "@/lib/render-job";
import { dispatchRenderJob } from "@/lib/runpod";
import { getMaxAudioDurationSeconds } from "@/lib/server-config";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = createRenderRequestSchema(getMaxAudioDurationSeconds()).parse(
      await request.json(),
    );
    const jobId = await dispatchRenderJob(input);
    return Response.json({ jobId, status: "queued" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start export.";
    const status = message.startsWith("RunPod") ? 502 : 400;
    return Response.json({ error: message }, { status });
  }
}
