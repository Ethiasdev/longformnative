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

export const wrappedBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    source: z.string().min(1),
    lines: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    kind: z.literal("spacer"),
  }),
]);

export const wrappedTranscriptSchema = z.object({
  blocks: z.array(wrappedBlockSchema).min(1),
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
    const actualLines = countWrappedLines(value.wrapped.blocks);
    if (actualLines !== value.wrapped.lineCount) {
      context.addIssue({
        code: "custom",
        path: ["wrapped", "lineCount"],
        message: "lineCount does not match the measured transcript.",
      });
    }
    const expectedHeight = calculateTextHeight(
      value.wrapped.lineCount,
      value.settings.fontSize,
      value.settings.lineHeight,
    );
    if (Math.abs(expectedHeight - value.wrapped.textHeight) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["wrapped", "textHeight"],
        message: "textHeight does not match the fixed typography settings.",
      });
    }
    if (reconstructTranscript(value.wrapped.blocks) !== value.transcript) {
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
export type WrappedBlock = z.infer<typeof wrappedBlockSchema>;
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
  lineIndex: number;
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
    .replace(/^\s*\n+/, "")
    .replace(/\n+\s*$/, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" "))
    .filter(Boolean)
    .join("\n\n");
  if (normalizeCache.size > 64) normalizeCache.clear();
  normalizeCache.set(value, normalized);
  return normalized;
}

export function splitSourceLines(value: string): string[] {
  const normalized = normalizeTranscript(value);
  return normalized ? normalized.split("\n") : [];
}

export function countWrappedLines(blocks: WrappedBlock[]): number {
  return blocks.reduce(
    (total, block) => total + (block.kind === "spacer" ? 1 : block.lines.length),
    0,
  );
}

export function reconstructTranscript(blocks: WrappedBlock[]): string {
  return blocks
    .map((block) => (block.kind === "spacer" ? "" : block.source))
    .join("\n");
}

export function findOversizedTokens(params: {
  transcript: string;
  maxWidth: number;
  measure: MeasureText;
}): OversizedToken[] {
  return splitSourceLines(params.transcript).flatMap((line, lineIndex) => {
    if (line === "") return [];
    const tokens = line.match(/\S+/g) ?? (params.measure(line) > params.maxWidth ? [line] : []);
    return tokens
      .filter((token) => params.measure(token) > params.maxWidth)
      .map((token) => ({
        token,
        lineIndex,
        measuredWidth: params.measure(token),
      }));
  });
}

export function createMeasuredTranscriptSchema(maxWidth: number, measure: MeasureText) {
  return transcriptSchema.superRefine((transcript, context) => {
    findOversizedTokens({ transcript, maxWidth, measure }).forEach(({ token, lineIndex }) => {
      context.addIssue({
        code: "custom",
        message: `Line ${lineIndex + 1}: “${token}” is too wide to fit without splitting.`,
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
  fontSize: number,
  lineHeight: number,
): number {
  if (lineCount === 0) return 0;
  return lineCount * fontSize * lineHeight;
}

function wrapSourceLine(line: string, maxWidth: number, measure: MeasureText): string[] {
  if (measure(line) <= maxWidth) return [line];
  const words = line.match(/\S+/g);
  if (!words) return [line];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const wrapCache = new Map<string, WrappedTranscript>();

export function wrapCacheKey(params: {
  transcript: string;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
}): string {
  return [params.transcript, params.maxWidth, params.fontSize, params.lineHeight].join("\u001f");
}

export function wrapTranscript(params: {
  transcript: string;
  maxWidth: number;
  measure: MeasureText;
  fontSize: number;
  lineHeight: number;
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

  const blocks = splitSourceLines(result.data).map((line) =>
    line === ""
      ? { kind: "spacer" as const }
      : {
          kind: "text" as const,
          source: line,
          lines: wrapSourceLine(line, params.maxWidth, params.measure),
        },
  );
  const lineCount = countWrappedLines(blocks);
  const wrapped = {
    blocks,
    lineCount,
    textHeight: calculateTextHeight(lineCount, params.fontSize, params.lineHeight),
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
  lineStep: number;
}): number {
  const readingY = params.height * 0.58;
  const scrollDistance = Math.max(0, params.textHeight - params.lineStep);
  const startY = readingY;
  const endY = readingY - scrollDistance;
  const progress =
    params.finalAudioFrame <= 0
      ? 1
      : Math.min(1, Math.max(0, params.frame / params.finalAudioFrame));
  return startY + (endY - startY) * progress;
}
