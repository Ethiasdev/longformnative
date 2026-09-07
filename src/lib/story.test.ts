import { describe, expect, it } from "vitest";
import {
  DEFAULT_FPS,
  DEFAULT_MAX_AUDIO_DURATION_SECONDS,
  DEFAULT_SETTINGS,
  MAX_TRANSCRIPT_CHARACTERS,
  calculateTextHeight,
  durationToFrames,
  editorInputSchema,
  linearScrollY,
  normalizeTranscript,
  reconstructTranscript,
  settingsSchema,
  splitSourceLines,
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
  });

describe("transcript normalization and validation", () => {
  it("only converts Windows line endings and keeps internal blank lines", () => {
    const normalized = normalizeTranscript("  Hello \t world \r\n\r\n\r\n Second  line \r");
    expect(normalized).toBe("  Hello \t world \n\n\n Second  line ");
    expect(splitSourceLines(normalized)).toEqual([
      "  Hello \t world ",
      "",
      "",
      " Second  line ",
    ]);
  });

  it("strips only leading and trailing blank lines", () => {
    expect(normalizeTranscript("\n\nFirst\n\nSecond\n\n")).toBe("First\n\nSecond");
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
    expect(result.blocks[0]).toEqual({
      kind: "text",
      source: "the director returns",
      lines: ["the", "director", "returns"],
    });
    const rendered = result.blocks.flatMap((block) =>
      block.kind === "text" ? block.lines : [],
    );
    expect(rendered).toContain("director");
    expect(rendered.join(" ")).toBe("the director returns");
    expect(rendered.some((line) => /dire|ctor/.test(line) && !line.includes("director"))).toBe(
      false,
    );
  });

  it("wraps long sentences only at spaces", () => {
    const result = wrap("one two three four", 90);
    expect(result.blocks).toEqual([
      { kind: "text", source: "one two three four", lines: ["one two", "three", "four"] },
    ]);
  });

  it("one blank line creates one line-height of spacing", () => {
    const result = wrap("First paragraph.\n\nSecond paragraph.", 1000);
    expect(result.blocks).toEqual([
      { kind: "text", source: "First paragraph.", lines: ["First paragraph."] },
      { kind: "spacer" },
      { kind: "text", source: "Second paragraph.", lines: ["Second paragraph."] },
    ]);
    expect(result.lineCount).toBe(3);
    expect(result.textHeight).toBe(3 * 10 * 1.2);
    expect(result.textHeight).toBe(calculateTextHeight(3, 10, 1.2));
  });

  it("preserves multiple blank lines as extra line-height spacers", () => {
    const result = wrap("First paragraph.\n\n\n\nSecond paragraph.", 1000);
    expect(result.blocks.filter((block) => block.kind === "spacer")).toHaveLength(3);
    expect(result.lineCount).toBe(5);
    expect(result.textHeight).toBe(5 * 10 * 1.2);
  });

  it("preview and export calculate identical text height from the same layout", () => {
    const transcript = "First paragraph.\n\n\nSecond paragraph.";
    const shared = {
      transcript,
      maxWidth: 1000,
      measure: monospace,
      fontSize: DEFAULT_SETTINGS.fontSize,
      lineHeight: DEFAULT_SETTINGS.lineHeight,
    };
    const preview = wrapTranscript(shared);
    const exportLayout = wrapTranscript(shared);
    expect(exportLayout).toBe(preview);
    expect(exportLayout).toEqual(preview);
    expect(exportLayout.lineCount).toBe(4);
    expect(exportLayout.textHeight).toBe(preview.textHeight);
    expect(exportLayout.textHeight).toBe(4 * DEFAULT_SETTINGS.fontSize * DEFAULT_SETTINGS.lineHeight);
    const manifest = storyManifestSchema.parse({
      transcript,
      durationSeconds: 60,
      fps: 60,
      imageUrl: "https://example.com/image.jpg",
      audioUrl: "https://example.com/audio.mp3",
      settings: DEFAULT_SETTINGS,
      wrapped: preview,
    });
    expect(manifest.wrapped.textHeight).toBe(preview.textHeight);
    expect(manifest.wrapped.textHeight).toBe(
      calculateTextHeight(manifest.wrapped.lineCount, DEFAULT_SETTINGS.fontSize, DEFAULT_SETTINGS.lineHeight),
    );
  });

  it("produces a manifest identical to normalized layout text", () => {
    const transcript = "  one   two\r\n\r\n three  ";
    const wrapped = wrapTranscript({
      transcript,
      maxWidth: 100,
      measure: monospace,
      fontSize: 54,
      lineHeight: 1.2,
    });
    const manifest = {
      transcript,
      durationSeconds: 60,
      fps: 60,
      imageUrl: "https://example.com/image.jpg",
      audioUrl: "https://example.com/audio.mp3",
      settings: {
        ...DEFAULT_SETTINGS,
        fontSize: 54,
        lineHeight: 1.2,
      },
      wrapped,
    };
    const result = storyManifestSchema.parse(manifest);
    expect(result.transcript).toBe("  one   two\n\n three  ");
    expect(reconstructTranscript(result.wrapped.blocks)).toBe(result.transcript);
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
      fps: 60,
    };
    expect(editorInputSchema.safeParse({ ...base, durationSeconds: 3600 }).success).toBe(true);
    const result = editorInputSchema.safeParse({ ...base, durationSeconds: 3601 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("60 minutes");
  });

  it("maps duration to ceil(seconds * fps) at both output rates", () => {
    expect(DEFAULT_FPS).toBe(60);
    expect(durationToFrames(15 * 60, 30)).toBe(27_000);
    expect(durationToFrames(15 * 60, 60)).toBe(54_000);
    expect(durationToFrames(15 * 60)).toBe(54_000);
    expect(durationToFrames(1.001, 30)).toBe(31);
    expect(durationToFrames(1.001, 60)).toBe(61);
  });
});

describe("layout motion", () => {
  it("includes empty lines in the total text height", () => {
    expect(calculateTextHeight(4, 20, 1.2)).toBe(96);
    expect(calculateTextHeight(1, 68, 1.22)).toBe(68 * 1.22);
  });

  it("uses the exact clamped linear start and end formula", () => {
    const base = { finalAudioFrame: 100, height: 1000, textHeight: 600 };
    expect(linearScrollY({ ...base, frame: -1 })).toBe(720);
    expect(linearScrollY({ ...base, frame: 50 })).toBe(150);
    expect(linearScrollY({ ...base, frame: 100 })).toBe(-420);
    expect(linearScrollY({ ...base, frame: 101 })).toBe(-420);
  });

  it("keeps a floating-point Y and a constant step between frames", () => {
    const base = { finalAudioFrame: 240, height: 1920, textHeight: 733 };
    const values = [0, 1, 2, 3].map((frame) => linearScrollY({ ...base, frame }));
    const step = values[1]! - values[0]!;
    expect(values[0]).toBe(1920 * 0.72);
    expect(Number.isInteger(values[1]!)).toBe(false);
    expect(values[1]).not.toBe(Math.round(values[1]!));
    expect(values[2]! - values[1]!).toBeCloseTo(step, 10);
    expect(values[3]! - values[2]!).toBeCloseTo(step, 10);
  });

  it("returns the same Y when a frame is read again after seeking", () => {
    const sample = { frame: 87, finalAudioFrame: 599, height: 1920, textHeight: 1400 };
    expect(linearScrollY(sample)).toBe(linearScrollY(sample));
    expect(linearScrollY({ ...sample, frame: 0 })).toBe(1920 * 0.72);
    expect(linearScrollY({ ...sample, frame: 599 })).toBeCloseTo(1920 * 0.18 - 1400, 10);
  });

  it("reuses the same wrapped layout object when inputs are unchanged", () => {
    const first = wrap("one two\n\nthree four", 90);
    const second = wrap("one two\n\nthree four", 90);
    expect(second).toBe(first);
  });
});
