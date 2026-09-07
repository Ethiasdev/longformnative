import { createRequire } from "node:module";
import { mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerRequire = createRequire(join(root, "worker", "package.json"));
const { durationToFrames, linearScrollY } = await import(
  pathToFileURL(join(root, "worker", "dist", "src", "lib", "story.js")).href
);

const height = 1920;
const textHeight = 900;
const durationSeconds = 2;

function inspectFps(fps) {
  const totalFrames = durationToFrames(durationSeconds, fps);
  const finalAudioFrame = totalFrames - 1;
  const stamps = [0, 0.25, 0.5, 0.75, 1].map((progress) => {
    const frame = Math.round(progress * finalAudioFrame);
    const y = linearScrollY({ frame, finalAudioFrame, height, textHeight });
    return { progress, frame, y };
  });
  const first = linearScrollY({ frame: 0, finalAudioFrame, height, textHeight });
  const second = linearScrollY({ frame: 1, finalAudioFrame, height, textHeight });
  return {
    fps,
    totalFrames,
    startY: first,
    step: second - first,
    integerStep: Number.isInteger(second),
    stamps,
  };
}

function ffprobe(path, args) {
  return new Promise((resolvePromise, reject) => {
    const process = spawn("ffprobe", args.concat(path), { windowsHide: true });
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (chunk) => { stdout += String(chunk); });
    process.stderr.on("data", (chunk) => { stderr += String(chunk); });
    process.on("error", reject);
    process.on("close", (code) => (
      code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr.trim() || `ffprobe ${code}`))
    ));
  });
}

async function renderSample(fps, outputPath) {
  const { bundle } = workerRequire("@remotion/bundler");
  const { ensureBrowser, renderMedia, selectComposition } = workerRequire("@remotion/renderer");
  await ensureBrowser();
  const serveUrl = await bundle({
    entryPoint: join(root, "worker", "remotion-entry.tsx"),
    rootDir: root,
    publicDir: join(root, "public"),
    outDir: join(root, "motion-samples", `bundle-${fps}`),
  });
  const inputProps = {
    imageUrl: "",
    audioUrl: "",
    durationSeconds,
    fps,
    settings: {
      fontSize: 68,
      textColumnWidth: 860,
      lineHeight: 1.22,
      paragraphGap: 34,
      outlineWidth: 5,
      backgroundDarkening: 0.2,
      imageVerticalFocalPosition: 50,
    },
    wrapped: {
      paragraphs: [
        { lines: ["Smooth credits sample"] },
        { lines: ["Frame rate", `${fps} FPS`] },
      ],
      lineCount: 3,
      textHeight: 68 * 1.22 * 3 + 34,
    },
  };
  const composition = await selectComposition({
    serveUrl,
    id: "StoryScroll",
    inputProps,
  });
  const expectedFrames = durationToFrames(durationSeconds, fps);
  if (composition.durationInFrames !== expectedFrames || composition.fps !== fps) {
    throw new Error(
      `Composition metadata mismatch at ${fps} fps: ${composition.fps} fps, ${composition.durationInFrames} frames`,
    );
  }
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    crf: 23,
    x264Preset: "ultrafast",
    outputLocation: outputPath,
    overwrite: true,
    scale: 0.5,
  });
  return { expectedFrames, compositionFps: composition.fps };
}

const reports = [30, 60].map(inspectFps);
console.log(JSON.stringify({ formula: reports }, null, 2));
for (const report of reports) {
  if (report.integerStep) {
    throw new Error(`${report.fps} fps movement snapped to whole pixels.`);
  }
  if (report.totalFrames !== Math.ceil(durationSeconds * report.fps)) {
    throw new Error(`${report.fps} fps frame count is not ceil(duration * fps).`);
  }
}

const outputDirectory = join(root, "motion-samples");
await mkdir(outputDirectory, { recursive: true });

for (const fps of [30, 60]) {
  const outputPath = join(outputDirectory, `credits-${fps}fps.mp4`);
  const rendered = await renderSample(fps, outputPath);
  const info = await stat(outputPath);
  let probe = null;
  try {
    const raw = await ffprobe(outputPath, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=avg_frame_rate,nb_frames,width,height",
      "-of", "json",
    ]);
    probe = JSON.parse(raw);
  } catch (error) {
    probe = { error: error instanceof Error ? error.message : String(error) };
  }
  console.log(JSON.stringify({
    fps,
    outputPath,
    bytes: info.size,
    expectedFrames: rendered.expectedFrames,
    compositionFps: rendered.compositionFps,
    probe,
  }, null, 2));
  if (info.size < 1024) throw new Error(`${fps} fps sample was too small to be a real MP4.`);
}
