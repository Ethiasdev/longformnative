import { z } from "zod";

export const OUTPUT_FRAME_RATES = [30, 60] as const;
export type OutputFrameRate = (typeof OUTPUT_FRAME_RATES)[number];
export const DEFAULT_FPS: OutputFrameRate = 60;
export const FPS = DEFAULT_FPS;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const DEFAULT_MAX_AUDIO_DURATION_SECONDS = 60 * 60;
export const MAX_TRANSCRIPT_CHARACTERS = 80_000;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
export const INTER_FONT_FAMILY = "StoryScroll Inter";

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
] as const;

export const transcriptSchema = z
  .string()
  .transform(normalizeTranscript)
  .pipe(
    z
      .string()
      .min(1, "Add a transcript.")
      .max(
        MAX_TRANSCRIPT_CHARACTERS,
        `Transcript must be ${MAX_TRANSCRIPT_CHARACTERS.toLocaleString("en-US")} characters or fewer.`,
      ),
  );

export const fpsSchema = z.union([z.literal(30), z.literal(60)]);

export const settingsSchema = z.object({
  fontSize: z.number().int().min(54).max(82),
  textColumnWidth: z.number().int().min(720).max(920),
  lineHeight: z.number().min(1.1).max(1.4),
  paragraphGap: z.number().int().min(16).max(52),
  outlineWidth: z.number().int().min(2).max(8),
  backgroundDarkening: z.number().min(0).max(0.6),
  imageVerticalFocalPosition: z.number().min(0).max(100),
});

export const wrappedTranscriptSchema = z.object({
  paragraphs: z.array(z.object({ lines: z.array(z.string().min(1)).min(1) })).min(1),
  lineCount: z.number().int().positive(),
  textHeight: z.number().finite().positive(),
});

export function createEditorInputSchema(
  maxDurationSeconds = DEFAULT_MAX_AUDIO_DURATION_SECONDS,
) {
  return z.object({
    transcript: transcriptSchema,
    durationSeconds: z
      .number()
      .finite()
      .positive("Choose a valid audio file.")
      .max(
        maxDurationSeconds,
        `Audio must be ${Math.floor(maxDurationSeconds / 60)} minutes or shorter.`,
      ),
    imageUrl: z.string().min(1, "Choose a background image."),
    audioUrl: z.string().min(1, "Choose an audio file."),
    settings: settingsSchema,
    fps: fpsSchema,
  });
}

export const editorInputSchema = createEditorInputSchema();

export function createStoryManifestSchema(
  maxDurationSeconds = DEFAULT_MAX_AUDIO_DURATION_SECONDS,
) {
  return createEditorInputSchema(maxDurationSeconds)
    .extend({
    imageUrl: z.url(),
    audioUrl: z.url(),
    wrapped: wrappedTranscriptSchema,
  })
  .superRefine((value, context) => {
    const actualLines = value.wrapped.paragraphs.reduce(
      (total, paragraph) => total + paragraph.lines.length,
      0,
    );
    if (actualLines !== value.wrapped.lineCount) {
      context.addIssue({
        code: "custom",
        path: ["wrapped", "lineCount"],
        message: "lineCount does not match the measured transcript.",
      });
    }
    const expectedHeight = calculateTextHeight(
      value.wrapped.lineCount,
      value.wrapped.paragraphs.length,
      value.settings.fontSize,
      value.settings.lineHeight,
      value.settings.paragraphGap,
    );
    if (Math.abs(expectedHeight - value.wrapped.textHeight) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["wrapped", "textHeight"],
        message: "textHeight does not match the fixed typography settings.",
      });
    }
    const wrappedText = value.wrapped.paragraphs
      .map((paragraph) => paragraph.lines.join(" "))
      .join("\n\n");
    if (wrappedText !== value.transcript) {
      context.addIssue({
        code: "custom",
        path: ["wrapped"],
        message: "Wrapped lines do not match the normalized transcript.",
      });
    }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_MANIFEST_BYTES) {
      context.addIssue({
        code: "custom",
        message: "The layout manifest exceeds the 1 MB export limit.",
      });
    }
    });
}

export const storyManifestSchema = createStoryManifestSchema();

export type StorySettings = z.infer<typeof settingsSchema>;
export type StoryManifest = z.infer<typeof storyManifestSchema>;

export type WrappedParagraph = { lines: string[] };
export type WrappedTranscript = z.infer<typeof wrappedTranscriptSchema>;

export type StoryCompositionProps = {
  imageUrl: string;
  audioUrl: string;
  durationSeconds: number;
  fps: OutputFrameRate;
  settings: StorySettings;
  wrapped: WrappedTranscript;
};

export type MeasureText = (value: string) => number;
export type OversizedToken = {
  token: string;
  paragraphIndex: number;
  measuredWidth: number;
};

export const DEFAULT_SETTINGS: StorySettings = {
  fontSize: 68,
  textColumnWidth: 860,
  lineHeight: 1.22,
  paragraphGap: 34,
  outlineWidth: 5,
  backgroundDarkening: 0.2,
  imageVerticalFocalPosition: 50,
};

const normalizeCache = new Map<string, string>();

export function normalizeTranscript(value: string): string {
  const cached = normalizeCache.get(value);
  if (cached !== undefined) return cached;
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalizeCache.size > 64) normalizeCache.clear();
  normalizeCache.set(value, normalized);
  return normalized;
}

export function splitParagraphs(value: string): string[] {
  const normalized = normalizeTranscript(value);
  return normalized ? normalized.split(/\n\s*\n/) : [];
}

export function findOversizedTokens(params: {
  transcript: string;
  maxWidth: number;
  measure: MeasureText;
}): OversizedToken[] {
  return splitParagraphs(params.transcript).flatMap((paragraph, paragraphIndex) =>
    paragraph
      .split(/\s+/)
      .filter((token) => params.measure(token) > params.maxWidth)
      .map((token) => ({
        token,
        paragraphIndex,
        measuredWidth: params.measure(token),
      })),
  );
}

export function createMeasuredTranscriptSchema(maxWidth: number, measure: MeasureText) {
  return transcriptSchema.superRefine((transcript, context) => {
    findOversizedTokens({ transcript, maxWidth, measure }).forEach(({ token, paragraphIndex }) => {
      context.addIssue({
        code: "custom",
        message: `Paragraph ${paragraphIndex + 1}: “${token}” is too wide to fit without splitting.`,
      });
    });
  });
}

export function durationToFrames(seconds: number, fps: number = DEFAULT_FPS): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(fps) || fps <= 0) return 1;
  return Math.max(1, Math.ceil(seconds * fps));
}

export function calculateTextHeight(
  lineCount: number,
  paragraphCount: number,
  fontSize: number,
  lineHeight: number,
  paragraphGap: number,
): number {
  if (lineCount === 0) return 0;
  return lineCount * fontSize * lineHeight + Math.max(0, paragraphCount - 1) * paragraphGap;
}

const wrapCache = new Map<string, WrappedTranscript>();

export function wrapCacheKey(params: {
  transcript: string;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  paragraphGap: number;
}): string {
  return [
    params.transcript,
    params.maxWidth,
    params.fontSize,
    params.lineHeight,
    params.paragraphGap,
  ].join("\u001f");
}

export function wrapTranscript(params: {
  transcript: string;
  maxWidth: number;
  measure: MeasureText;
  fontSize: number;
  lineHeight: number;
  paragraphGap: number;
}): WrappedTranscript {
  const cacheKey = wrapCacheKey(params);
  const cached = wrapCache.get(cacheKey);
  if (cached) return cached;

  const result = createMeasuredTranscriptSchema(params.maxWidth, params.measure).safeParse(
    params.transcript,
  );
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join("\n"));
  }

  const paragraphs = splitParagraphs(result.data).map((paragraph) => {
    const lines: string[] = [];
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (params.measure(candidate) <= params.maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return { lines };
  });
  const lineCount = paragraphs.reduce((sum, paragraph) => sum + paragraph.lines.length, 0);
  const wrapped = {
    paragraphs,
    lineCount,
    textHeight: calculateTextHeight(
      lineCount,
      paragraphs.length,
      params.fontSize,
      params.lineHeight,
      params.paragraphGap,
    ),
  };
  if (wrapCache.size > 32) wrapCache.clear();
  wrapCache.set(cacheKey, wrapped);
  return wrapped;
}

export function isOutputFrameRate(value: number): value is OutputFrameRate {
  return value === 30 || value === 60;
}

export function linearScrollY(params: {
  frame: number;
  finalAudioFrame: number;
  height: number;
  textHeight: number;
}): number {
  const startY = params.height * 0.72;
  const endY = params.height * 0.18 - params.textHeight;
  const progress =
    params.finalAudioFrame <= 0
      ? 1
      : Math.min(1, Math.max(0, params.frame / params.finalAudioFrame));
  return startY + (endY - startY) * progress;
}
