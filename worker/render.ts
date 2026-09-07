import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { put } from "@vercel/blob";
import {
  DEFAULT_MAX_AUDIO_DURATION_SECONDS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  createStoryManifestSchema,
  durationToFrames,
} from "../src/lib/story.js";

const PROGRESS_PREFIX = "__STORYSCROLL_PROGRESS__";

function reportProgress(stage: string, progress: number): void {
  process.stderr.write(
    `${PROGRESS_PREFIX}${JSON.stringify({
      stage,
      progress: Math.min(0.99, Math.max(0, progress)),
    })}\n`,
  );
}

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

function assTimestamp(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const remainingSeconds = Math.floor((centiseconds % 6000) / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${String(remainder).padStart(2, "0")}`;
}

function escapeAssText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");
}

export function createCreditsAss(params: {
  durationSeconds: number;
  fontSize: number;
  lineHeight: number;
  outlineWidth: number;
  textHeight: number;
  lines: string[];
}): string {
  const lineStep = params.fontSize * params.lineHeight;
  const startY = VIDEO_HEIGHT * 0.72;
  const endY = VIDEO_HEIGHT * 0.18 - params.textHeight;
  const durationMs = Math.max(1, Math.round(params.durationSeconds * 1000));
  const endTimestamp = assTimestamp(params.durationSeconds);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${VIDEO_WIDTH}
PlayResY: ${VIDEO_HEIGHT}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,${params.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${params.outlineWidth},2,8,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = params.lines.flatMap((line, index) => {
    if (!line) return [];
    const lineOffset = index * lineStep;
    const fromY = Math.round(startY + lineOffset);
    const toY = Math.round(endY + lineOffset);
    const motion = `\\an8\\move(${VIDEO_WIDTH / 2},${fromY},${VIDEO_WIDTH / 2},${toY},0,${durationMs})`;
    return [
      `Dialogue: 0,0:00:00.00,${endTimestamp},Default,,0,0,0,,{${motion}}${escapeAssText(line)}`,
    ];
  });
  return `${header}\n${events.join("\n")}\n`;
}

export function flattenWrappedLines(
  blocks: Array<
    | { kind: "spacer" }
    | { kind: "text"; source: string; lines: string[] }
  >,
): string[] {
  return blocks.flatMap((block) => block.kind === "spacer" ? [""] : block.lines);
}

async function renderWithFfmpeg(params: {
  imagePath: string;
  audioPath: string;
  assPath: string;
  fontsDirectory: string;
  outputPath: string;
  durationSeconds: number;
  fps: number;
  backgroundDarkening: number;
  imageVerticalFocalPosition: number;
}): Promise<void> {
  const focal = params.imageVerticalFocalPosition / 100;
  const filter = [
    `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:x=(iw-ow)/2:y=(ih-oh)*${focal.toFixed(4)}`,
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@${params.backgroundDarkening.toFixed(3)}:t=fill`,
    `subtitles=filename=${basename(params.assPath)}:fontsdir=${params.fontsDirectory}`,
    "format=yuv420p[v]",
  ].join(",");

  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-nostdin",
    "-y",
    "-loop", "1",
    "-framerate", String(params.fps),
    "-i", params.imagePath,
    "-i", params.audioPath,
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "1:a:0",
    "-t", params.durationSeconds.toFixed(3),
    "-r", String(params.fps),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-tune", "stillimage",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    "-progress", "pipe:2",
    "-nostats",
    params.outputPath,
  ];

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("ffmpeg", args, { cwd: dirname(params.assPath) });
    const diagnostics: string[] = [];
    const stderr = createInterface({ input: child.stderr });
    stderr.on("line", (line) => {
      const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line);
      if (match) {
        const microseconds = Number(match[1]);
        const renderProgress = Math.min(1, microseconds / 1_000_000 / params.durationSeconds);
        reportProgress("rendering", 0.1 + renderProgress * 0.84);
      } else if (line && !/^progress=/.test(line)) {
        diagnostics.push(line);
        if (diagnostics.length > 40) diagnostics.shift();
        process.stderr.write(`${line}\n`);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`FFmpeg render failed (${code}): ${diagnostics.join("\n")}`));
    });
  });
}

export async function executeRender(rawInput: unknown): Promise<{ outputUrl: string; frames: number }> {
  const manifest = createStoryManifestSchema(getMaxAudioDurationSeconds()).parse(rawInput);
  const renderId = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), `storyscroll-${renderId}-`));
  try {
    reportProgress("preparing", 0.01);
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
    const assPath = join(directory, "credits.ass");
    const outputPath = join(directory, "storyscroll.mp4");

    await Promise.all([
      download(manifest.imageUrl, imagePath),
      download(manifest.audioUrl, audioPath),
    ]);
    reportProgress("probing_audio", 0.04);
    const durationSeconds = await ffprobeDuration(audioPath);
    const frames = durationToFrames(durationSeconds, manifest.fps);

    reportProgress("preparing_credits", 0.06);
    await writeFile(assPath, createCreditsAss({
      durationSeconds,
      fontSize: manifest.settings.fontSize,
      lineHeight: manifest.settings.lineHeight,
      outlineWidth: manifest.settings.outlineWidth,
      textHeight: manifest.wrapped.textHeight,
      lines: flattenWrappedLines(manifest.wrapped.blocks),
    }), "utf8");

    reportProgress("rendering", 0.1);
    await renderWithFfmpeg({
      imagePath,
      audioPath,
      assPath,
      fontsDirectory,
      outputPath,
      durationSeconds,
      fps: manifest.fps,
      backgroundDarkening: manifest.settings.backgroundDarkening,
      imageVerticalFocalPosition: manifest.settings.imageVerticalFocalPosition,
    });

    reportProgress("uploading_output", 0.95);
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
