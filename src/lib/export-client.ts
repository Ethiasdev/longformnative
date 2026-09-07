import { upload } from "@vercel/blob/client";
import { z } from "zod";
import type { StoryManifest } from "@/lib/render-job";

export type ExportStatus =
  | { state: "idle" }
  | { state: "uploading"; progress: number }
  | { state: "queued"; jobId: string; progress: number }
  | { state: "rendering"; jobId: string; progress: number }
  | { state: "uploading_output"; jobId: string; progress: number }
  | { state: "completed"; jobId: string; progress: 1; downloadUrl: string }
  | { state: "failed"; message: string; jobId?: string };

const jobResponseSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "uploading", "queued", "rendering", "uploading_output", "completed", "failed"]),
  progress: z.number().min(0).max(1),
  outputUrl: z.url().nullable(),
  error: z.string().nullable(),
});

export async function uploadExportAssets(params: {
  imageFile: File;
  audioFile: File;
  manifest: StoryManifest;
  onProgress: (progress: number) => void;
}) {
  const uploadOne = async (kind: "image" | "audio", file: File, offset: number) =>
    upload(`${kind}/${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/blob-upload",
      clientPayload: JSON.stringify({ kind }),
      onUploadProgress: ({ percentage }) => params.onProgress(offset + percentage / 300),
    });
  const image = await uploadOne("image", params.imageFile, 0);
  const audio = await uploadOne("audio", params.audioFile, 1 / 3);
  const manifestWithUrls = { ...params.manifest, imageUrl: image.url, audioUrl: audio.url };
  const manifestFile = new File(
    [JSON.stringify(manifestWithUrls)],
    "manifest.json",
    { type: "application/json" },
  );
  const manifest = await upload("manifest/manifest.json", manifestFile, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    clientPayload: JSON.stringify({ kind: "manifest" }),
    onUploadProgress: ({ percentage }) => params.onProgress(2 / 3 + percentage / 300),
  });
  return { imageUrl: image.url, audioUrl: audio.url, manifestUrl: manifest.url, manifest: manifestWithUrls };
}

export async function createExportJob(input: Awaited<ReturnType<typeof uploadExportAssets>>) {
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
  const response = await fetch(`/api/render-jobs/${jobId}`, { cache: "no-store" });
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
  const state = job.status === "draft" || job.status === "uploading" ? "queued" : job.status;
  return { state, jobId, progress: job.progress };
}
