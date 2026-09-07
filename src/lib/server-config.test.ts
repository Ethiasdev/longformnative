import { afterEach, describe, expect, it } from "vitest";
import { getMaxAudioDurationSeconds } from "./server-config";

const originalValue = process.env.MAX_AUDIO_DURATION_SECONDS;

afterEach(() => {
  if (originalValue === undefined) {
    delete process.env.MAX_AUDIO_DURATION_SECONDS;
  } else {
    process.env.MAX_AUDIO_DURATION_SECONDS = originalValue;
  }
});

describe("audio duration server configuration", () => {
  it("defaults to 3600 seconds", () => {
    delete process.env.MAX_AUDIO_DURATION_SECONDS;
    expect(getMaxAudioDurationSeconds()).toBe(3600);
  });

  it("accepts a positive configured number of seconds", () => {
    process.env.MAX_AUDIO_DURATION_SECONDS = "2400";
    expect(getMaxAudioDurationSeconds()).toBe(2400);
  });

  it("falls back for invalid configuration", () => {
    process.env.MAX_AUDIO_DURATION_SECONDS = "not-a-number";
    expect(getMaxAudioDurationSeconds()).toBe(3600);
  });
});
