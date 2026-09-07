import React from "react";
import { Composition, registerRoot } from "remotion";
import { StoryComposition } from "../src/remotion/StoryComposition";
import {
  DEFAULT_FPS,
  DEFAULT_SETTINGS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  durationToFrames,
  type StoryCompositionProps,
} from "../src/lib/story";

const placeholder: StoryCompositionProps = {
  imageUrl: "",
  audioUrl: "",
  durationSeconds: 1,
  fps: DEFAULT_FPS,
  settings: DEFAULT_SETTINGS,
  wrapped: {
    paragraphs: [{ lines: ["StoryScroll"] }],
    lineCount: 1,
    textHeight: DEFAULT_SETTINGS.fontSize * DEFAULT_SETTINGS.lineHeight,
  },
};

function RemotionRoot() {
  return (
    <Composition
      id="StoryScroll"
      component={StoryComposition}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      fps={DEFAULT_FPS}
      durationInFrames={durationToFrames(placeholder.durationSeconds, placeholder.fps)}
      defaultProps={placeholder}
      calculateMetadata={({ props }) => ({
        fps: props.fps,
        durationInFrames: durationToFrames(props.durationSeconds, props.fps),
      })}
    />
  );
}

registerRoot(RemotionRoot);
