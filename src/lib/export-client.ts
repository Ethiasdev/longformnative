import { upload } from "@vercel/blob/client";
import { z } from "zod";
import type { StoryManifest } from "@/lib/story";

export type ExportStatus =
  | { state: "idle" }
  | { state: "uploading"; progress: number }
  | { state: "queued"; jobId: string; progress: number }
  | { state: "rendering"; jobId: string; progress: number }
  | { state: "uploading_output"; jobId: string; progress: number }
  | { state: "completed"; jobId: string; progress: 1; downloadUrl: string }
  | { state: "failed"; message: string; jobId?: string };

const jobResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["queued", "rendering", "uploading_output", "completed", "failed"]),
  progress: z.number().min(0).max(1),
  outputUrl: z.url().nullable(),
  error: z.string().nullable(),
});

export async function uploadExportAssets(params: {
  imageFile: File;
  audioFile: File;
  onProgress: (progress: number) => void;
}) {
  const image = await upload(`image/${params.imageFile.name}`, params.imageFile, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    clientPayload: JSON.stringify({ kind: "image" }),
    onUploadProgress: ({ percentage }) => params.onProgress(percentage / 200),
  });
  const audio = await upload(`audio/${params.audioFile.name}`, params.audioFile, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    clientPayload: JSON.stringify({ kind: "audio" }),
    onUploadProgress: ({ percentage }) => params.onProgress(0.5 + percentage / 200),
  });
  return { imageUrl: image.url, audioUrl: audio.url };
}

export async function createExportJob(input: StoryManifest) {
  const response = await fetch("/api/render-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as { jobId?: string; error?: string };
  if (!response.ok || !payload.jobId) throw new Error(payload.error || "Unable to start export.");
  return payload.jobId;
}

export async function getExportStatus(jobId: string): Promise<ExportStatus> {
  const response = await fetch(`/api/render-jobs/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const raw = await response.json();
  if (!response.ok) throw new Error((raw as { error?: string }).error || "Unable to read export.");
  const job = jobResponseSchema.parse(raw);
  if (job.status === "failed") {
    return { state: "failed", jobId, message: job.error || "Render failed." };
  }
  if (job.status === "completed") {
    if (!job.outputUrl) throw new Error("Render completed without an output URL.");
    return { state: "completed", jobId, progress: 1, downloadUrl: job.outputUrl };
  }
  return { state: job.status, jobId, progress: job.progress };
}
