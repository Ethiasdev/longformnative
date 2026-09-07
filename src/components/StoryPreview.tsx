"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { memo, useEffect, useMemo, useRef } from "react";
import { StoryComposition } from "@/remotion/StoryComposition";
import {
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  durationToFrames,
  type StoryCompositionProps,
} from "@/lib/story";

type PreviewControls = {
  seek: (frame: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentFrame: () => number | null;
};

declare global {
  interface Window {
    __storyPreview?: PreviewControls;
  }
}

export const StoryPreview = memo(function StoryPreview({
  props,
}: {
  props: StoryCompositionProps;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const durationInFrames = useMemo(
    () => durationToFrames(props.durationSeconds, props.fps),
    [props.durationSeconds, props.fps],
  );

  useEffect(() => {
    window.__storyPreview = {
      seek: (frame) => playerRef.current?.seekTo(frame),
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      getCurrentFrame: () => playerRef.current?.getCurrentFrame() ?? null,
    };
    return () => {
      delete window.__storyPreview;
    };
  }, []);

  return (
    <Player
      ref={playerRef}
      component={StoryComposition}
      inputProps={props}
      durationInFrames={durationInFrames}
      compositionWidth={VIDEO_WIDTH}
      compositionHeight={VIDEO_HEIGHT}
      fps={props.fps}
      controls
      acknowledgeRemotionLicense
      logLevel="error"
      numberOfSharedAudioTags={1}
      spaceKeyToPlayOrPause
      style={{
        width: "100%",
        aspectRatio: "9 / 16",
        transform: "translate3d(0, 0, 0)",
        backfaceVisibility: "hidden",
      }}
    />
  );
});
