import {
  INTER_FONT_FAMILY,
  type StorySettings,
  type WrappedTranscript,
  wrapTranscript,
} from "@/lib/story";

export type LayoutSettings = Pick<
  StorySettings,
  "fontSize" | "textColumnWidth" | "lineHeight" | "paragraphGap"
>;

export function measureAndWrapTranscript(
  transcript: string,
  settings: LayoutSettings,
): WrappedTranscript {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot measure text.");
  }
  context.font = `700 ${settings.fontSize}px "${INTER_FONT_FAMILY}"`;
  context.fontKerning = "normal";
  return wrapTranscript({
    transcript,
    maxWidth: settings.textColumnWidth,
    measure: (value) => context.measureText(value).width,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    paragraphGap: settings.paragraphGap,
  });
}
