import { z } from "zod";
import {
  createStoryManifestSchema,
  storyManifestSchema,
  type StoryManifest,
} from "@/lib/story";

export const renderJobStatuses = [
  "draft",
  "uploading",
  "queued",
  "rendering",
  "uploading_output",
  "completed",
  "failed",
] as const;

export const renderJobStatusSchema = z.enum(renderJobStatuses);
export type RenderJobStatus = z.infer<typeof renderJobStatusSchema>;

const publicBlobUrlSchema = z.url().refine((value) => {
  const hostname = new URL(value).hostname;
  return hostname === "blob.vercel-storage.com" || hostname.endsWith(".blob.vercel-storage.com");
}, "Assets must be uploaded to Vercel Blob.");

export { storyManifestSchema };
export type { StoryManifest };

export function createRenderJobSchemaForDuration(maxDurationSeconds: number) {
  return z.object({
    imageUrl: publicBlobUrlSchema,
    audioUrl: publicBlobUrlSchema,
    manifestUrl: publicBlobUrlSchema,
    manifest: createStoryManifestSchema(maxDurationSeconds),
  });
}

export const createRenderJobSchema = createRenderJobSchemaForDuration(60 * 60);

export const workerCallbackSchema = z.object({
  status: z.enum(["rendering", "uploading_output", "completed", "failed"]),
  progress: z.number().min(0).max(1).optional(),
  outputUrl: z.url().optional(),
  error: z.string().min(1).max(4_000).optional(),
}).superRefine((value, context) => {
  if (value.status === "completed" && !value.outputUrl) {
    context.addIssue({ code: "custom", path: ["outputUrl"], message: "Required when completed." });
  }
  if (value.status === "failed" && !value.error) {
    context.addIssue({ code: "custom", path: ["error"], message: "Required when failed." });
  }
});

export type RenderJob = {
  id: string;
  status: RenderJobStatus;
  progress: number;
  imageUrl: string;
  audioUrl: string;
  manifestUrl: string;
  manifest: StoryManifest;
  outputUrl: string | null;
  error: string | null;
  runpodJobId: string | null;
  createdAt: string;
  updatedAt: string;
};
