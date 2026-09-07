import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { put } from "@vercel/blob";
import {
  DEFAULT_MAX_AUDIO_DURATION_SECONDS,
  createStoryManifestSchema,
  durationToFrames,
} from "../src/lib/story.js";

function getMaxAudioDurationSeconds(): number {
  const configured = Number(process.env.MAX_AUDIO_DURATION_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_AUDIO_DURATION_SECONDS;
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(destination),
  );
}

async function ffprobeDuration(path: string): Promise<number> {
  const output = await new Promise<string>((resolvePromise, reject) => {
    const process = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (chunk) => { stdout += String(chunk); });
    process.stderr.on("data", (chunk) => { stderr += String(chunk); });
    process.on("error", reject);
    process.on("close", (code) => code === 0
      ? resolvePromise(stdout.trim())
      : reject(new Error(`ffprobe failed (${code}): ${stderr.trim()}`)));
  });
  const duration = Number(output);
  const maxDuration = getMaxAudioDurationSeconds();
  if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration) {
    throw new Error(`Audio duration must be between 0 and ${maxDuration} seconds.`);
  }
  return duration;
}

export async function executeRender(rawInput: unknown): Promise<{ outputUrl: string; frames: number }> {
  const manifest = createStoryManifestSchema(getMaxAudioDurationSeconds()).parse(rawInput);
  const renderId = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), `storyscroll-${renderId}-`));
  try {
    const assetsDirectory = join(directory, "assets");
    await mkdir(assetsDirectory);
    const fontsDirectory = join(assetsDirectory, "fonts");
    await mkdir(fontsDirectory);
    await copyFile(
      resolve(process.cwd(), "public/fonts/Inter-Bold.woff2"),
      join(fontsDirectory, "Inter-Bold.woff2"),
    );
    await copyFile(
      resolve(process.cwd(), "public/fonts/LICENSE.txt"),
      join(fontsDirectory, "LICENSE.txt"),
    );
    const imagePath = join(assetsDirectory, `image${extname(new URL(manifest.imageUrl).pathname) || ".img"}`);
    const audioPath = join(assetsDirectory, `audio${extname(new URL(manifest.audioUrl).pathname) || ".audio"}`);
    const outputPath = join(directory, "storyscroll.mp4");

    await Promise.all([
      download(manifest.imageUrl, imagePath),
      download(manifest.audioUrl, audioPath),
    ]);
    const durationSeconds = await ffprobeDuration(audioPath);
    const props = {
      ...manifest,
      durationSeconds,
      imageUrl: basename(imagePath),
      audioUrl: basename(audioPath),
    };
    const frames = durationToFrames(durationSeconds, manifest.fps);

    const serveUrl = await bundle({
      entryPoint: resolve(process.cwd(), "worker/remotion-entry.tsx"),
      rootDir: process.cwd(),
      publicDir: assetsDirectory,
      outDir: join(directory, "bundle"),
      onProgress: () => undefined,
    });
    const composition = await selectComposition({
      serveUrl,
      id: "StoryScroll",
      inputProps: props,
      browserExecutable: process.env.CHROME_PATH,
    });
    if (composition.durationInFrames !== frames) {
      throw new Error(`Frame mismatch: expected ${frames}, got ${composition.durationInFrames}.`);
    }

    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      crf: 18,
      x264Preset: "medium",
      outputLocation: outputPath,
      overwrite: true,
      browserExecutable: process.env.CHROME_PATH,
      ffmpegOverride: ({ args, type }) => {
        if (type !== "stitcher") return args;
        return [...args.slice(0, -1), "-movflags", "+faststart", args.at(-1) ?? outputPath];
      },
    });

    const blob = await put(
      `renders/${renderId}/${basename(outputPath)}`,
      createReadStream(outputPath),
      {
        access: "public",
        multipart: true,
        contentType: "video/mp4",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
    return { outputUrl: blob.url, frames };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
