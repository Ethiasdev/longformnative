import { afterEach, describe, expect, it } from "vitest";
import {
  getConfigurationStatus,
  getMaxAudioDurationSeconds,
  getRequiredServerVariables,
} from "./server-config";

const originalDuration = process.env.MAX_AUDIO_DURATION_SECONDS;
const originalBlob = process.env.BLOB_READ_WRITE_TOKEN;
const originalKey = process.env.RUNPOD_API_KEY;
const originalEndpoint = process.env.RUNPOD_ENDPOINT_ID;

afterEach(() => {
  restore("MAX_AUDIO_DURATION_SECONDS", originalDuration);
  restore("BLOB_READ_WRITE_TOKEN", originalBlob);
  restore("RUNPOD_API_KEY", originalKey);
  restore("RUNPOD_ENDPOINT_ID", originalEndpoint);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

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

describe("required export configuration", () => {
  it("requires only Blob and RunPod credentials", () => {
    expect(getRequiredServerVariables()).toEqual([
      "BLOB_READ_WRITE_TOKEN",
      "RUNPOD_API_KEY",
      "RUNPOD_ENDPOINT_ID",
    ]);
  });

  it("lists missing server variables without leftover database or webhook names", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.RUNPOD_API_KEY;
    delete process.env.RUNPOD_ENDPOINT_ID;
    expect(getConfigurationStatus()).toEqual({
      configured: false,
      missing: ["BLOB_READ_WRITE_TOKEN", "RUNPOD_API_KEY", "RUNPOD_ENDPOINT_ID"],
    });
  });

  it("is configured when the three required values are present", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    process.env.RUNPOD_API_KEY = "key";
    process.env.RUNPOD_ENDPOINT_ID = "endpoint";
    expect(getConfigurationStatus()).toEqual({ configured: true, missing: [] });
  });
});
