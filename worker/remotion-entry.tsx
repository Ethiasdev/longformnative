import React from "react";
import { Composition, registerRoot } from "remotion";
import { StoryComposition } from "../src/remotion/StoryComposition";
import {
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  DEFAULT_SETTINGS,
  durationToFrames,
  type StoryCompositionProps,
} from "../src/lib/story";

const placeholder: StoryCompositionProps = {
  imageUrl: "",
  audioUrl: "",
  durationSeconds: 1,
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
      fps={FPS}
      durationInFrames={durationToFrames(placeholder.durationSeconds)}
      defaultProps={placeholder}
      calculateMetadata={({ props }) => ({
        durationInFrames: durationToFrames(props.durationSeconds),
      })}
    />
  );
}

registerRoot(RemotionRoot);
