import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_AUDIO_DURATION_SECONDS,
  DEFAULT_SETTINGS,
  MAX_TRANSCRIPT_CHARACTERS,
  calculateTextHeight,
  durationToFrames,
  editorInputSchema,
  linearScrollY,
  normalizeTranscript,
  settingsSchema,
  splitParagraphs,
  storyManifestSchema,
  transcriptSchema,
  wrapTranscript,
} from "./story";

const monospace = (value: string) => value.length * 10;
const wrap = (transcript: string, maxWidth = 100) =>
  wrapTranscript({
    transcript,
    maxWidth,
    measure: monospace,
    fontSize: 10,
    lineHeight: 1.2,
    paragraphGap: 7,
  });

describe("transcript normalization and validation", () => {
  it("normalizes line endings and repeated spaces without losing paragraphs", () => {
    const normalized = normalizeTranscript("  Hello \t world \r\n\r\n\r\n Second  line \r");
    expect(normalized).toBe("Hello world\n\nSecond line");
    expect(splitParagraphs(normalized)).toEqual(["Hello world", "Second line"]);
  });

  it("supports a 60-minute-safe transcript limit", () => {
    expect(MAX_TRANSCRIPT_CHARACTERS).toBe(80_000);
    expect(transcriptSchema.safeParse("a".repeat(MAX_TRANSCRIPT_CHARACTERS)).success).toBe(true);
    expect(transcriptSchema.safeParse("a".repeat(MAX_TRANSCRIPT_CHARACTERS + 1)).success).toBe(false);
  });

  it("lists every oversized token", () => {
    expect(() => wrap("ordinary extraordinarilylong anotheroversizedtoken", 100)).toThrow(
      /extraordinarilylong[\s\S]*anotheroversizedtoken/,
    );
  });
});

describe("measured word-safe wrapping", () => {
  it("uses exact measured widths and never splits director", () => {
    const result = wrap("the director returns", 110);
    expect(result.paragraphs[0]?.lines).toEqual(["the", "director", "returns"]);
    expect(result.paragraphs.flatMap((paragraph) => paragraph.lines)).toContain("director");
  });

  it("keeps exact-width lines and paragraph boundaries", () => {
    const result = wrap("one two\n\nthree four", 90);
    expect(result.paragraphs).toEqual([
      { lines: ["one two"] },
      { lines: ["three", "four"] },
    ]);
    expect(result.textHeight).toBe(3 * 10 * 1.2 + 7);
  });

  it("produces a manifest identical to normalized layout text", () => {
    const transcript = "  one   two\r\n\r\n three  ";
    const wrapped = wrapTranscript({
      transcript,
      maxWidth: 100,
      measure: monospace,
      fontSize: 54,
      lineHeight: 1.2,
      paragraphGap: 16,
    });
    const manifest = {
      transcript,
      durationSeconds: 60,
      imageUrl: "https://example.com/image.jpg",
      audioUrl: "https://example.com/audio.mp3",
      settings: {
        ...DEFAULT_SETTINGS,
        fontSize: 54,
        lineHeight: 1.2,
        paragraphGap: 16,
      },
      wrapped,
    };
    const result = storyManifestSchema.parse(manifest);
    expect(result.transcript).toBe("one two\n\nthree");
    expect(
      result.wrapped.paragraphs.map((paragraph) => paragraph.lines.join(" ")).join("\n\n"),
    ).toBe(result.transcript);
  });
});

describe("settings and duration", () => {
  it("uses the exact required defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      fontSize: 68,
      textColumnWidth: 860,
      lineHeight: 1.22,
      paragraphGap: 34,
      outlineWidth: 5,
      backgroundDarkening: 0.2,
      imageVerticalFocalPosition: 50,
    });
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, fontSize: 53 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, textColumnWidth: 921 }).success).toBe(false);
  });

  it("accepts 60 minutes and reports the 60-minute limit", () => {
    expect(DEFAULT_MAX_AUDIO_DURATION_SECONDS).toBe(3600);
    const base = {
      transcript: "Story",
      imageUrl: "blob:image",
      audioUrl: "blob:audio",
      settings: DEFAULT_SETTINGS,
    };
    expect(editorInputSchema.safeParse({ ...base, durationSeconds: 3600 }).success).toBe(true);
    const result = editorInputSchema.safeParse({ ...base, durationSeconds: 3601 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("60 minutes");
  });

  it("maps 15 minutes to exactly 27,000 frames", () => {
    expect(durationToFrames(15 * 60)).toBe(27_000);
    expect(durationToFrames(1.001)).toBe(31);
  });
});

describe("layout motion", () => {
  it("calculates line boxes plus the exact paragraph gap", () => {
    expect(calculateTextHeight(4, 2, 20, 1.2, 34)).toBe(130);
  });

  it("uses the exact clamped linear start and end formula", () => {
    const base = { finalAudioFrame: 100, height: 1000, textHeight: 600 };
    expect(linearScrollY({ ...base, frame: -1 })).toBe(720);
    expect(linearScrollY({ ...base, frame: 50 })).toBe(150);
    expect(linearScrollY({ ...base, frame: 100 })).toBe(-420);
    expect(linearScrollY({ ...base, frame: 101 })).toBe(-420);
  });
});
