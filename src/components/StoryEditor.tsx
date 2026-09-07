"use client";

import { AudioLines, CheckCircle2, Download, ImageIcon, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StoryPreview } from "@/components/StoryPreview";
import { measureAndWrapTranscript } from "@/lib/browser-layout";
import {
  AUDIO_MIME_TYPES,
  DEFAULT_FPS,
  DEFAULT_MAX_AUDIO_DURATION_SECONDS,
  DEFAULT_SETTINGS,
  IMAGE_MIME_TYPES,
  INTER_FONT_FAMILY,
  createEditorInputSchema,
  isOutputFrameRate,
  normalizeTranscript,
  storyManifestSchema,
  type OutputFrameRate,
  type StoryCompositionProps,
  type StorySettings,
} from "@/lib/story";
import {
  createExportJob,
  getExportStatus,
  uploadExportAssets,
  type ExportStatus,
} from "@/lib/export-client";

const SAMPLE_TRANSCRIPT =
  "Every great story begins with a moment that asks us to look closer.\n\nAdd your transcript here, choose an image and narration, then shape the pace.";
const LAYOUT_DEBOUNCE_MS = 250;

type LocalMedia = { file: File; name: string; url: string };
type FontState = "loading" | "ready" | "error";

function useMediaCleanup(media: LocalMedia | null) {
  const pendingRevocations = useRef(new Map<string, number>());
  useEffect(() => {
    const revocations = pendingRevocations.current;
    const url = media?.url;
    if (url) {
      const pending = revocations.get(url);
      if (pending !== undefined) {
        window.clearTimeout(pending);
        revocations.delete(url);
      }
    }
    return () => {
      if (!url) return;
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        revocations.delete(url);
      }, 0);
      revocations.set(url, timer);
    };
  }, [media]);
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function formatDuration(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function StoryEditor() {
  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPT);
  const debouncedTranscript = useDebouncedValue(transcript, LAYOUT_DEBOUNCE_MS);
  const [image, setImage] = useState<LocalMedia | null>(null);
  const [audio, setAudio] = useState<LocalMedia | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [audioMetadataLoading, setAudioMetadataLoading] = useState(false);
  const [fontState, setFontState] = useState<FontState>("loading");
  const [settings, setSettings] = useState<StorySettings>(DEFAULT_SETTINGS);
  const [fps, setFps] = useState<OutputFrameRate>(DEFAULT_FPS);
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ state: "idle" });
  const [missingVariables, setMissingVariables] = useState<string[]>([]);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [maxAudioDuration, setMaxAudioDuration] = useState(
    DEFAULT_MAX_AUDIO_DURATION_SECONDS,
  );
  useMediaCleanup(image);
  useMediaCleanup(audio);
  const layoutPending = fontState === "ready" && transcript !== debouncedTranscript;

  useEffect(() => {
    let active = true;
    document.fonts
      .load(`700 68px "${INTER_FONT_FAMILY}"`)
      .then(() => {
        if (!document.fonts.check(`700 68px "${INTER_FONT_FAMILY}"`)) {
          throw new Error("Bundled Inter Bold did not load.");
        }
        if (active) setFontState("ready");
      })
      .catch(() => {
        if (active) setFontState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void fetch("/api/configuration", { cache: "no-store" })
      .then(async (response) => {
        const value = (await response.json()) as {
          missing?: string[];
          maxAudioDurationSeconds?: number;
        };
        setMissingVariables(value.missing ?? []);
        if (
          Number.isFinite(value.maxAudioDurationSeconds) &&
          (value.maxAudioDurationSeconds ?? 0) > 0
        ) {
          setMaxAudioDuration(value.maxAudioDurationSeconds!);
        }
      })
      .catch(() => setMissingVariables(["server configuration"]))
      .finally(() => setConfigurationLoaded(true));
  }, []);

  useEffect(() => {
    if (
      exportStatus.state !== "queued" &&
      exportStatus.state !== "rendering" &&
      exportStatus.state !== "uploading_output"
    ) return;
    const jobId = exportStatus.jobId;
    const timer = window.setTimeout(() => {
      void getExportStatus(jobId)
        .then(setExportStatus)
        .catch((error) =>
          setExportStatus({
            state: "failed",
            jobId,
            message: error instanceof Error ? error.message : "Unable to poll render.",
          }),
        );
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [exportStatus]);

  const layoutSettings = useMemo(
    () => ({
      fontSize: settings.fontSize,
      textColumnWidth: settings.textColumnWidth,
      lineHeight: settings.lineHeight,
      paragraphGap: settings.paragraphGap,
    }),
    [settings.fontSize, settings.lineHeight, settings.paragraphGap, settings.textColumnWidth],
  );
  const layoutResult = useMemo(() => {
    if (fontState !== "ready") return { wrapped: null, error: null };
    try {
      return {
        wrapped: measureAndWrapTranscript(debouncedTranscript, layoutSettings),
        error: null,
      };
    } catch (error) {
      return {
        wrapped: null,
        error: error instanceof Error ? error.message : "Unable to lay out transcript.",
      };
    }
  }, [debouncedTranscript, fontState, layoutSettings]);

  const previewProps = useMemo<StoryCompositionProps | null>(() => {
    if (!layoutResult.wrapped || !image || !audio || durationSeconds <= 0) return null;
    return {
      imageUrl: image.url,
      audioUrl: audio.url,
      durationSeconds,
      fps,
      settings,
      wrapped: layoutResult.wrapped,
    };
  }, [audio, durationSeconds, fps, image, layoutResult.wrapped, settings]);

  const validation = createEditorInputSchema(maxAudioDuration).safeParse({
    transcript,
    durationSeconds: audio ? durationSeconds : 0,
    imageUrl: image?.url ?? "",
    audioUrl: audio?.url ?? "",
    settings,
    fps,
  });
  const validationMessage = validation.success
    ? null
    : validation.error.issues[0]?.message ?? "Check the editor inputs.";
  const exportDisabled =
    !validation.success ||
    Boolean(layoutResult.error) ||
    layoutPending ||
    fontState !== "ready" ||
    audioMetadataLoading ||
    !configurationLoaded ||
    missingVariables.length > 0 ||
    !["idle", "failed", "completed"].includes(exportStatus.state);

  const setSetting = <K extends keyof StorySettings>(key: K, value: StorySettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const selectImage = (file: File | null) => {
    setMediaError(null);
    if (file && !IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
      setImage(null);
      setMediaError("Unsupported image type. Choose a JPEG, PNG, or WebP file.");
      return;
    }
    setImage(
      file ? { file, name: file.name, url: URL.createObjectURL(file) } : null,
    );
  };

  const selectAudio = (file: File | null) => {
    setMediaError(null);
    setDurationSeconds(0);
    setAudio(null);
    if (!file) return;
    if (!AUDIO_MIME_TYPES.includes(file.type as (typeof AUDIO_MIME_TYPES)[number])) {
      setMediaError("Unsupported audio type. Choose an MP3, WAV, M4A, MP4 audio, or AAC file.");
      return;
    }

    setAudioMetadataLoading(true);
    const url = URL.createObjectURL(file);
    const element = document.createElement("audio");
    const cleanUp = () => {
      URL.revokeObjectURL(url);
      setAudioMetadataLoading(false);
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = element.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        setMediaError("The selected audio has invalid duration metadata.");
      } else if (duration > maxAudioDuration) {
        setMediaError(
          `Audio must be ${Math.floor(maxAudioDuration / 60)} minutes or shorter.`,
        );
      } else {
        setDurationSeconds(duration);
        setAudio({ file, name: file.name, url: URL.createObjectURL(file) });
      }
      cleanUp();
    };
    element.onerror = () => {
      setMediaError("Unable to read audio metadata. The file may be corrupt or unsupported.");
      cleanUp();
    };
    element.src = url;
  };

  const startExport = async () => {
    if (!image || !audio || !previewProps) return;
    try {
      const measured = storyManifestSchema.parse({
        ...previewProps,
        transcript: normalizeTranscript(transcript),
      });
      setExportStatus({ state: "uploading", progress: 0 });
      const uploaded = await uploadExportAssets({
        imageFile: image.file,
        audioFile: audio.file,
        onProgress: (progress) => setExportStatus({ state: "uploading", progress }),
      });
      const jobId = await createExportJob({
        ...measured,
        imageUrl: uploaded.imageUrl,
        audioUrl: uploaded.audioUrl,
      });
      setExportStatus({ state: "queued", jobId, progress: 0 });
    } catch (error) {
      setExportStatus({
        state: "failed",
        message: error instanceof Error ? error.message : "Unable to start export.",
      });
    }
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto max-w-[1480px] px-5 py-5 lg:px-8">
          <h1 className="text-lg font-bold text-white">StoryScroll</h1>
          <p className="text-xs text-zinc-500">Narrated vertical video editor</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(340px,1fr)_minmax(240px,320px)_minmax(280px,340px)] lg:px-8">
        <section aria-label="Story source" className="min-w-0">
          <div className="panel p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Source</p>
                <h2 className="section-title">Media and transcript</h2>
              </div>
              <span className="text-xs text-zinc-500">
                {transcript.length.toLocaleString()} characters
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <FilePicker
                icon={<ImageIcon size={18} />}
                label="Background image"
                accept={IMAGE_MIME_TYPES.join(",")}
                media={image}
                onChange={selectImage}
              />
              <FilePicker
                icon={<AudioLines size={18} />}
                label="Narration audio"
                accept={AUDIO_MIME_TYPES.join(",")}
                media={audio}
                meta={audio ? formatDuration(durationSeconds) : undefined}
                loading={audioMetadataLoading}
                onChange={selectAudio}
              />
            </div>
            {mediaError ? (
              <p role="alert" className="mt-3 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {mediaError}
              </p>
            ) : null}

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-zinc-200">Transcript</span>
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                className="field min-h-64 resize-y leading-7"
                placeholder="Paste your transcript. Blank lines preserve paragraphs."
                spellCheck
              />
            </label>
            {layoutResult.error ? (
              <p className="mt-3 whitespace-pre-line rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {layoutResult.error}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-zinc-500">
              Repeated spaces are normalized. Paragraph breaks remain. Words are never split.
            </p>
            {layoutPending ? (
              <p aria-live="polite" className="mt-2 text-xs text-zinc-400">
                Measuring transcript…
              </p>
            ) : null}
          </div>
        </section>

        <section aria-label="Story preview" className="min-w-0 lg:sticky lg:top-5 lg:self-start">
          <div className="panel p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Preview</p>
                <h2 className="section-title">9:16 video</h2>
              </div>
              <span className="whitespace-nowrap text-xs text-zinc-500">
                {formatDuration(durationSeconds)} · {fps} fps
              </span>
            </div>
            <div
              role="region"
              aria-label="Video preview"
              data-ready={previewProps ? "true" : "false"}
              className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-lg border border-zinc-800 bg-black"
            >
              {fontState === "loading" ? (
                <div className="grid aspect-[9/16] place-items-center text-sm text-zinc-400">
                  Loading Inter Bold…
                </div>
              ) : fontState === "error" ? (
                <div role="alert" className="grid aspect-[9/16] place-items-center p-6 text-center text-sm text-red-300">
                  Inter Bold failed to load. Preview and export are unavailable.
                </div>
              ) : previewProps ? (
                <StoryPreview key={`${audio?.url ?? "no-audio"}-${fps}`} props={previewProps} />
              ) : (
                <div className="grid aspect-[9/16] place-items-center p-6 text-center text-sm text-zinc-500">
                  Add media to preview your story.
                </div>
              )}
            </div>
          </div>
        </section>

        <aside aria-label="Text settings and export" className="min-w-0 space-y-5 lg:sticky lg:top-5 lg:self-start">
          <details className="panel group p-5">
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <Settings2 size={18} className="text-zinc-400" />
              <div>
                <p className="eyebrow">Text settings</p>
                <h2 className="section-title">Typography and framing</h2>
              </div>
              <span className="ml-auto text-xs text-zinc-500 group-open:hidden">Expand</span>
            </summary>
            <div className="mt-6 grid gap-y-6 border-t border-zinc-800 pt-6">
              <Range label="Font size" value={settings.fontSize} min={54} max={82} suffix=" px" onChange={(value) => setSetting("fontSize", value)} />
              <Range label="Text column" value={settings.textColumnWidth} min={720} max={920} suffix=" px" onChange={(value) => setSetting("textColumnWidth", value)} />
              <Range label="Line height" value={settings.lineHeight} min={1.1} max={1.4} step={0.01} onChange={(value) => setSetting("lineHeight", value)} />
              <Range label="Paragraph gap" value={settings.paragraphGap} min={16} max={52} suffix=" px" onChange={(value) => setSetting("paragraphGap", value)} />
              <Range label="Outline width" value={settings.outlineWidth} min={2} max={8} suffix=" px" onChange={(value) => setSetting("outlineWidth", value)} />
              <Range label="Background darkening" value={Math.round(settings.backgroundDarkening * 100)} min={0} max={60} suffix="%" onChange={(value) => setSetting("backgroundDarkening", value / 100)} />
              <Range label="Image focal position" value={settings.imageVerticalFocalPosition} min={0} max={100} suffix="%" onChange={(value) => setSetting("imageVerticalFocalPosition", value)} />
              <label className="text-sm font-medium text-zinc-300">
                <span className="flex justify-between">
                  <span>Output frame rate</span>
                  <span className="text-xs text-zinc-500">{fps} fps</span>
                </span>
                <select
                  className="field mt-4 py-2"
                  value={fps}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (isOutputFrameRate(next)) setFps(next);
                  }}
                >
                  <option value={60}>60 FPS — smoother credits</option>
                  <option value={30}>30 FPS — faster render</option>
                </select>
              </label>
            </div>
          </details>

          <div className="panel p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <CheckCircle2 size={16} className="text-zinc-400" />
              Export readiness
            </div>
              {validationMessage ? (
                <p className="text-xs leading-5 text-zinc-500">{validationMessage}</p>
              ) : null}
              {missingVariables.length ? (
                <p className="mt-2 text-xs leading-5 text-amber-300">
                  Export unavailable: missing {missingVariables.join(", ")}.
                </p>
              ) : null}
              {!configurationLoaded ? (
                <p className="mt-2 text-xs text-zinc-500">Checking export configuration…</p>
              ) : null}
              {"progress" in exportStatus &&
              exportStatus.state !== "completed" ? (
                <p aria-live="polite" className="mt-2 text-xs text-zinc-300">
                  {exportStatus.state.replace("_", " ")} · {Math.round(exportStatus.progress * 100)}%
                </p>
              ) : null}
              {exportStatus.state === "failed" ? (
                <p role="alert" className="mt-2 text-xs leading-5 text-red-300">
                  {exportStatus.message}
                </p>
              ) : null}
              {exportStatus.state === "completed" ? (
                <a className="button mt-4 bg-emerald-700 text-white" href={exportStatus.downloadUrl} download>
                  <Download size={17} />Download MP4
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void startExport()}
                disabled={exportDisabled}
                className="button mt-4 bg-white text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                <Download size={17} />
                {exportStatus.state === "failed"
                  ? "Retry export"
                  : exportStatus.state === "idle" || exportStatus.state === "completed"
                    ? "Export MP4"
                    : "Preparing export…"}
              </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function FilePicker({
  icon,
  label,
  accept,
  media,
  meta,
  loading,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  media: LocalMedia | null;
  meta?: string;
  loading?: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-4 hover:border-zinc-500">
      <input className="sr-only" type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      <span className="grid size-10 shrink-0 place-items-center rounded bg-zinc-800 text-zinc-300">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-zinc-200">{label}</span>
        <span className="mt-1 block truncate text-xs text-zinc-500">
          {loading ? "Reading metadata…" : media ? media.name : "Choose a file"}
          {meta ? ` · ${meta}` : ""}
        </span>
      </span>
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-medium text-zinc-300">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-xs text-zinc-500">{value}{suffix}</span>
      </span>
      <input className="mt-4 w-full accent-zinc-200" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
