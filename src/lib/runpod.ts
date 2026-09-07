import type { RenderJob } from "@/lib/render-job";
import { requireServerVariable } from "@/lib/server-config";

export async function dispatchRenderJob(job: RenderJob): Promise<string> {
  const endpointId = requireServerVariable("RUNPOD_ENDPOINT_ID");
  const callbackBase = requireServerVariable("APP_BASE_URL").replace(/\/$/, "");
  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireServerVariable("RUNPOD_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: {
        jobId: job.id,
        imageUrl: job.imageUrl,
        audioUrl: job.audioUrl,
        manifestUrl: job.manifestUrl,
        callbackUrl: `${callbackBase}/api/render-jobs/${job.id}/callback`,
        webhookSecret: requireServerVariable("RENDER_WEBHOOK_SECRET"),
      },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error || `RunPod dispatch failed (${response.status}).`);
  }
  return payload.id;
}
