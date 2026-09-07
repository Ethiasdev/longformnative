import { randomUUID } from "node:crypto";
import { createRenderJob, updateRenderJob } from "@/lib/db";
import { createRenderJobSchemaForDuration } from "@/lib/render-job";
import { dispatchRenderJob } from "@/lib/runpod";
import { getMaxAudioDurationSeconds } from "@/lib/server-config";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const maxDuration = getMaxAudioDurationSeconds();
    const input = createRenderJobSchemaForDuration(maxDuration).parse(await request.json());
    if (
      input.manifest.imageUrl !== input.imageUrl ||
      input.manifest.audioUrl !== input.audioUrl
    ) {
      return Response.json({ error: "Manifest asset URLs do not match." }, { status: 400 });
    }

    const job = await createRenderJob({ id: randomUUID(), ...input });
    try {
      const runpodJobId = await dispatchRenderJob(job);
      await updateRenderJob(job.id, { status: "queued", runpodJobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to dispatch render.";
      await updateRenderJob(job.id, { status: "failed", error: message });
      return Response.json({ jobId: job.id, status: "failed", error: message }, { status: 502 });
    }
    return Response.json({ jobId: job.id, status: "queued" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid render job.";
    return Response.json({ error: message }, { status: 400 });
  }
}
