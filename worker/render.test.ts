import { describe, expect, it } from "vitest";
import { createCreditsAss, flattenWrappedLines } from "./render";

describe("FFmpeg credits layout", () => {
  it("preserves blank-line offsets without creating broken text events", () => {
    const lines = flattenWrappedLines([
      { kind: "text", source: "Hello director", lines: ["Hello", "director"] },
      { kind: "spacer" },
      { kind: "text", source: "Next paragraph", lines: ["Next paragraph"] },
    ]);

    expect(lines).toEqual(["Hello", "director", "", "Next paragraph"]);
    const ass = createCreditsAss({
      durationSeconds: 15,
      fontSize: 68,
      lineHeight: 1.22,
      outlineWidth: 5,
      textHeight: 4 * 68 * 1.22,
      lines,
    });

    expect(ass).toContain("Hello");
    expect(ass).toContain("director");
    expect(ass).toContain("Next paragraph");
    expect(ass.match(/^Dialogue:/gm)).toHaveLength(3);
    expect(ass).not.toContain("dire\\Nctor");
  });

  it("moves every line for the full audio duration", () => {
    const ass = createCreditsAss({
      durationSeconds: 900,
      fontSize: 68,
      lineHeight: 1.22,
      outlineWidth: 5,
      textHeight: 68 * 1.22,
      lines: ["A complete line"],
    });

    expect(ass).toContain("0:15:00.00");
    expect(ass).toContain(",0,900000)");
  });
});
