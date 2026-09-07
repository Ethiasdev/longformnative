import { describe, expect, it } from "vitest";
import { mapRunpodJob } from "./runpod";

describe("mapRunpodJob", () => {
  it("maps queued and in-progress statuses", () => {
    expect(mapRunpodJob("job-1", { status: "IN_QUEUE" })).toMatchObject({
      id: "job-1",
      status: "queued",
      progress: 0,
      outputUrl: null,
    });
    expect(mapRunpodJob("job-1", { status: "IN_PROGRESS" })).toMatchObject({
      status: "rendering",
      progress: 0.15,
    });
  });

  it("returns the completed MP4 URL", () => {
    expect(mapRunpodJob("job-1", {
      status: "COMPLETED",
      output: {
        ok: true,
        outputUrl: "https://example.blob.vercel-storage.com/storyscroll.mp4",
        frames: 900,
      },
    })).toEqual({
      id: "job-1",
      status: "completed",
      progress: 1,
      outputUrl: "https://example.blob.vercel-storage.com/storyscroll.mp4",
      error: null,
    });
  });

  it("fails when a completed job is missing an output URL", () => {
    expect(mapRunpodJob("job-1", { status: "COMPLETED", output: { ok: true } })).toMatchObject({
      status: "failed",
      error: "Render completed without an MP4 URL.",
    });
  });

  it("maps failed and cancelled RunPod statuses", () => {
    expect(mapRunpodJob("job-1", { status: "FAILED", error: "Chromium crashed." })).toMatchObject({
      status: "failed",
      error: "Chromium crashed.",
    });
    expect(mapRunpodJob("job-1", { status: "CANCELLED" })).toMatchObject({
      status: "failed",
      error: "RunPod job cancelled.",
    });
  });
});
