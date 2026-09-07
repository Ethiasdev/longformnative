import { memo, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Audio,
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
  type StorySettings,
  type WrappedTranscript,
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

function resolveAsset(value: string) {
  return /^(?:https?:|blob:|data:)/.test(value) ? value : staticFile(value);
}

const StoryImage = memo(function StoryImage({
  src,
  focalPosition,
}: {
  src: string;
  focalPosition: number;
}) {
  const [imageHandle] = useState(() => delayRender("Loading story image"));
  useEffect(() => {
    const preloader = new Image();
    preloader.onload = () => continueRender(imageHandle);
    preloader.onerror = () => cancelRender(new Error("The story image could not be decoded."));
    preloader.src = src;
    return () => {
      preloader.onload = null;
      preloader.onerror = null;
    };
  }, [imageHandle, src]);

  return (
    // A native image avoids duplicate decode attempts in the interactive Remotion Player.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `50% ${focalPosition}%`,
      }}
    />
  );
});

const CreditsColumn = memo(function CreditsColumn({
  settings,
  wrapped,
}: {
  settings: StorySettings;
  wrapped: WrappedTranscript;
}) {
  return (
    <>
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
    </>
  );
});

const CreditsScroller = memo(function CreditsScroller({
  settings,
  wrapped,
}: {
  settings: StorySettings;
  wrapped: WrappedTranscript;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames, height, width } = useVideoConfig();
  const y = linearScrollY({
    frame,
    finalAudioFrame: durationInFrames - 1,
    height,
    textHeight: wrapped.textHeight,
  });
  const columnLeft = (width - settings.textColumnWidth) / 2;

  return (
    <div
      data-credits-scroller="true"
      data-scroll-y={String(y)}
      style={{
        position: "absolute",
        top: 0,
        left: columnLeft,
        width: settings.textColumnWidth,
        transform: `translate3d(0, ${y}px, 0)`,
        willChange: "transform",
        backfaceVisibility: "hidden",
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
      <CreditsColumn settings={settings} wrapped={wrapped} />
    </div>
  );
});

export const StoryComposition = memo(function StoryComposition({
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

  const resolvedImage = useMemo(
    () => (imageUrl ? resolveAsset(imageUrl) : ""),
    [imageUrl],
  );
  const resolvedAudio = useMemo(
    () => (audioUrl ? resolveAsset(audioUrl) : ""),
    [audioUrl],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#111111", overflow: "hidden" }}>
      {resolvedImage ? (
        <StoryImage
          src={resolvedImage}
          focalPosition={settings.imageVerticalFocalPosition}
        />
      ) : null}
      <AbsoluteFill
        style={{ backgroundColor: `rgba(0,0,0,${settings.backgroundDarkening})` }}
      />
      {resolvedAudio ? <Audio src={resolvedAudio} /> : null}
      <CreditsScroller settings={settings} wrapped={wrapped} />
    </AbsoluteFill>
  );
});
