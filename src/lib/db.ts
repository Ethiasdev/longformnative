import { neon } from "@neondatabase/serverless";
import type { RenderJob, RenderJobStatus, StoryManifest } from "@/lib/render-job";
import { requireServerVariable } from "@/lib/server-config";

type JobRow = {
  id: string;
  status: RenderJobStatus;
  progress: number | string;
  image_url: string;
  audio_url: string;
  manifest_url: string;
  manifest: StoryManifest | string;
  output_url: string | null;
  error: string | null;
  runpod_job_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function sql() {
  return neon(requireServerVariable("DATABASE_URL"));
}

export async function ensureRenderJobsTable(): Promise<void> {
  await sql()`
    CREATE TABLE IF NOT EXISTS render_jobs (
      id UUID PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN (
        'draft', 'uploading', 'queued', 'rendering',
        'uploading_output', 'completed', 'failed'
      )),
      progress DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
      image_url TEXT NOT NULL,
      audio_url TEXT NOT NULL,
      manifest_url TEXT NOT NULL,
      manifest JSONB NOT NULL,
      output_url TEXT,
      error TEXT,
      runpod_job_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function createRenderJob(input: {
  id: string;
  imageUrl: string;
  audioUrl: string;
  manifestUrl: string;
  manifest: StoryManifest;
}): Promise<RenderJob> {
  await ensureRenderJobsTable();
  const rows = await sql()`
    INSERT INTO render_jobs (id, status, image_url, audio_url, manifest_url, manifest)
    VALUES (
      ${input.id}, 'queued', ${input.imageUrl}, ${input.audioUrl},
      ${input.manifestUrl}, ${JSON.stringify(input.manifest)}
    )
    RETURNING *
  `;
  return mapRow(rows[0] as JobRow);
}

export async function getRenderJob(id: string): Promise<RenderJob | null> {
  await ensureRenderJobsTable();
  const rows = await sql()`SELECT * FROM render_jobs WHERE id = ${id} LIMIT 1`;
  return rows[0] ? mapRow(rows[0] as JobRow) : null;
}

export async function updateRenderJob(
  id: string,
  update: {
    status: RenderJobStatus;
    progress?: number;
    outputUrl?: string | null;
    error?: string | null;
    runpodJobId?: string | null;
  },
): Promise<RenderJob | null> {
  await ensureRenderJobsTable();
  const rows = await sql()`
    UPDATE render_jobs SET
      status = ${update.status},
      progress = ${update.progress ?? 0},
      output_url = COALESCE(${update.outputUrl ?? null}, output_url),
      error = ${update.error ?? null},
      runpod_job_id = COALESCE(${update.runpodJobId ?? null}, runpod_job_id),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? mapRow(rows[0] as JobRow) : null;
}

function mapRow(row: JobRow): RenderJob {
  return {
    id: row.id,
    status: row.status,
    progress: Number(row.progress),
    imageUrl: row.image_url,
    audioUrl: row.audio_url,
    manifestUrl: row.manifest_url,
    manifest: typeof row.manifest === "string" ? JSON.parse(row.manifest) : row.manifest,
    outputUrl: row.output_url,
    error: row.error,
    runpodJobId: row.runpod_job_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
