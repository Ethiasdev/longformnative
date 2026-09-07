import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { getMaxUploadBytes } from "@/lib/server-config";
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES } from "@/lib/story";

export const runtime = "nodejs";

const clientPayloadSchema = z.object({
  kind: z.enum(["image", "audio"]),
});

const contentTypes = {
  image: IMAGE_MIME_TYPES,
  audio: AUDIO_MIME_TYPES,
} as const;
const extensions = {
  image: /\.(?:jpe?g|png|webp)$/i,
  audio: /\.(?:mp3|wav|m4a|aac)$/i,
} as const;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = clientPayloadSchema.parse(JSON.parse(clientPayload ?? "{}"));
        const safePathname = pathname.replace(/[^a-zA-Z0-9._/-]/g, "_");
        if (!safePathname.startsWith(`${parsed.kind}/`)) {
          throw new Error("Upload path does not match its declared kind.");
        }
        if (!extensions[parsed.kind].test(safePathname)) {
          throw new Error(`Unsupported ${parsed.kind} file extension.`);
        }
        return {
          allowedContentTypes: [...contentTypes[parsed.kind]],
          maximumSizeInBytes: getMaxUploadBytes(parsed.kind),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind: parsed.kind }),
        };
      },
      onUploadCompleted: async () => {
        // Blob has already enforced the short-lived token's type and size restrictions.
      },
    });
    return Response.json(response);
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : "Upload authorization failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
