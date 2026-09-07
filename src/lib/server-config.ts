import { DEFAULT_MAX_AUDIO_DURATION_SECONDS } from "./story";

const requiredServerVariables = [
  "BLOB_READ_WRITE_TOKEN",
  "DATABASE_URL",
  "RUNPOD_API_KEY",
  "RUNPOD_ENDPOINT_ID",
  "RENDER_WEBHOOK_SECRET",
  "APP_BASE_URL",
] as const;

export type ServerVariable = (typeof requiredServerVariables)[number];

export function getConfigurationStatus() {
  const missing = requiredServerVariables.filter((name) => !process.env[name]?.trim());
  return { configured: missing.length === 0, missing };
}

export function requireServerVariable(name: ServerVariable): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getMaxUploadBytes(kind: "image" | "audio"): number {
  const fallback = kind === "image" ? 20 * 1024 * 1024 : 200 * 1024 * 1024;
  const envName = kind === "image" ? "MAX_IMAGE_UPLOAD_MB" : "MAX_AUDIO_UPLOAD_MB";
  const configured = Number(process.env[envName]);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured * 1024 * 1024)
    : fallback;
}

export function getMaxAudioDurationSeconds(): number {
  const configured = Number(process.env.MAX_AUDIO_DURATION_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_AUDIO_DURATION_SECONDS;
}
