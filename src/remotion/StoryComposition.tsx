import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  INTER_FONT_FAMILY,
  linearScrollY,
  type StoryCompositionProps,
} from "../lib/story";

let interFontPromise: Promise<void> | null = null;

function loadInterFont(): Promise<void> {
  if (!interFontPromise) {
    const font = new FontFace(
      INTER_FONT_FAMILY,
      `url(${staticFile("fonts/Inter-Bold.woff2")})`,
      { style: "normal", weight: "700" },
    );
    interFontPromise = font.load().then((loaded) => {
      (document.fonts as FontFaceSet & { add(font: FontFace): FontFaceSet }).add(loaded);
    });
  }
  return interFontPromise;
}

export function StoryComposition({
  imageUrl,
  audioUrl,
  settings,
  wrapped,
}: StoryCompositionProps) {
  const [fontHandle] = useState(() => delayRender("Loading bundled Inter Bold"));
  useEffect(() => {
    loadInterFont()
      .then(() => continueRender(fontHandle))
      .catch((error) => cancelRender(error));
  }, [fontHandle]);

  const resolveAsset = (value: string) =>
    /^(?:https?:|blob:|data:)/.test(value) ? value : staticFile(value);
  const frame = useCurrentFrame();
  const { durationInFrames, height, width } = useVideoConfig();
  const y = linearScrollY({
    frame,
    finalAudioFrame: durationInFrames - 1,
    height,
    textHeight: wrapped.textHeight,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#111111", overflow: "hidden" }}>
      {imageUrl ? (
        <Img
          src={resolveAsset(imageUrl)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `50% ${settings.imageVerticalFocalPosition}%`,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{ backgroundColor: `rgba(0,0,0,${settings.backgroundDarkening})` }}
      />
      {audioUrl ? <Audio src={resolveAsset(audioUrl)} /> : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: (width - settings.textColumnWidth) / 2,
          width: settings.textColumnWidth,
          transform: `translateY(${y}px)`,
          color: "#ffffff",
          fontFamily: `"${INTER_FONT_FAMILY}"`,
          fontSize: settings.fontSize,
          fontWeight: 700,
          lineHeight: settings.lineHeight,
          letterSpacing: 0,
          textAlign: "center",
          WebkitTextStroke: `${settings.outlineWidth}px #000000`,
          WebkitTextStrokeWidth: `${settings.outlineWidth}px`,
          WebkitTextStrokeColor: "#000000",
          paintOrder: "stroke fill",
          textShadow: "0 2px 5px rgba(0,0,0,0.65)",
          whiteSpace: "pre-wrap",
          wordBreak: "normal",
          overflowWrap: "normal",
          hyphens: "none",
        }}
      >
        {wrapped.paragraphs.map((paragraph, paragraphIndex) => (
          <div
            key={paragraphIndex}
            style={{
              marginBottom:
                paragraphIndex < wrapped.paragraphs.length - 1
                  ? settings.paragraphGap
                  : 0,
            }}
          >
            {paragraph.lines.map((line, lineIndex) => (
              <div key={lineIndex}>{line}</div>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
