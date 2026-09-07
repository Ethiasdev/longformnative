import { z } from "zod";
import type { StoryManifest } from "./story";
import { requireServerVariable } from "./server-config";

export const runpodJobIdSchema = z
  .string()
  .trim()
  .min(1, "Missing RunPod job ID.")
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Invalid RunPod job ID.");

const runpodDispatchSchema = z.object({
  id: z.string().min(1),
  error: z.string().optional(),
});

const runpodOutputSchema = z.object({
  ok: z.boolean().optional(),
  outputUrl: z.url().optional(),
  frames: z.number().optional(),
  error: z.union([z.string(), z.object({ message: z.string() })]).optional(),
});

const runpodStatusSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  error: z.string().optional(),
  output: z.unknown().optional(),
});

export type MappedRunpodJob = {
  id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  outputUrl: string | null;
  error: string | null;
};

function endpointUrl(path: string): string {
  return `https://api.runpod.ai/v2/${requireServerVariable("RUNPOD_ENDPOINT_ID")}${path}`;
}

function authHeaders(): HeadersInit {
  return {
    authorization: `Bearer ${requireServerVariable("RUNPOD_API_KEY")}`,
    "content-type": "application/json",
  };
}

function unwrapOutput(value: unknown): unknown {
  if (Array.isArray(value) && value.length > 0) return value[0];
  return value;
}

function outputError(output: z.infer<typeof runpodOutputSchema> | null): string | null {
  if (!output?.error) return null;
  return typeof output.error === "string" ? output.error : output.error.message;
}

export function mapRunpodJob(jobId: string, raw: unknown): MappedRunpodJob {
  const parsed = runpodStatusSchema.parse(raw);
  const outputResult = runpodOutputSchema.safeParse(unwrapOutput(parsed.output));
  const output = outputResult.success ? outputResult.data : null;
  const status = parsed.status.toUpperCase();

  if (status === "COMPLETED") {
    if (!output?.outputUrl) {
      return {
        id: jobId,
        status: "failed",
        progress: 1,
        outputUrl: null,
        error: outputError(output) || parsed.error || "Render completed without an MP4 URL.",
      };
    }
    return {
      id: jobId,
      status: "completed",
      progress: 1,
      outputUrl: output.outputUrl,
      error: null,
    };
  }

  if (status === "FAILED" || status === "CANCELLED" || status === "CANCELED" || status === "TIMED_OUT") {
    return {
      id: jobId,
      status: "failed",
      progress: 0,
      outputUrl: null,
      error: parsed.error || outputError(output) || `RunPod job ${status.toLowerCase()}.`,
    };
  }

  return {
    id: jobId,
    status: status === "IN_PROGRESS" ? "rendering" : "queued",
    progress: status === "IN_PROGRESS" ? 0.15 : 0,
    outputUrl: null,
    error: null,
  };
}

export async function dispatchRenderJob(input: StoryManifest): Promise<string> {
  const response = await fetch(endpointUrl("/run"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ input }),
  });
  const payload = runpodDispatchSchema.safeParse(await response.json().catch(() => ({})));
  if (!response.ok || !payload.success || !payload.data.id) {
    const message = payload.success
      ? payload.data.error
      : undefined;
    throw new Error(message || `RunPod dispatch failed (${response.status}).`);
  }
  return runpodJobIdSchema.parse(payload.data.id);
}

export async function getRunpodJob(jobId: string): Promise<MappedRunpodJob> {
  const safeId = runpodJobIdSchema.parse(jobId);
  const response = await fetch(endpointUrl(`/status/${encodeURIComponent(safeId)}`), {
    headers: authHeaders(),
    cache: "no-store",
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof raw === "object" && raw && "error" in raw
      ? String((raw as { error?: string }).error || "")
      : "";
    throw new Error(message || `Unable to read RunPod status (${response.status}).`);
  }
  return mapRunpodJob(safeId, raw);
}
