import { z } from "zod";
import {
  createStoryManifestSchema,
  storyManifestSchema,
  type StoryManifest,
} from "@/lib/story";

export { storyManifestSchema };
export type { StoryManifest };

export const publicBlobUrlSchema = z.url().refine((value) => {
  const hostname = new URL(value).hostname;
  return hostname === "blob.vercel-storage.com" || hostname.endsWith(".blob.vercel-storage.com");
}, "Assets must be uploaded to Vercel Blob.");

export function createRenderRequestSchema(maxDurationSeconds: number) {
  return createStoryManifestSchema(maxDurationSeconds).safeExtend({
    imageUrl: publicBlobUrlSchema,
    audioUrl: publicBlobUrlSchema,
  });
}

export const renderRequestSchema = createRenderRequestSchema(60 * 60);
export type RenderRequest = z.infer<typeof renderRequestSchema>;
