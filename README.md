# StoryScroll

A desktop-first Next.js editor and Dockerized RunPod rendering pipeline for narrated, scrolling
9:16 H.264 videos.

## Architecture

1. Preview and text measurement run locally using the shared contract in `src/lib/story.ts`.
2. The browser obtains tightly scoped tokens from `/api/blob-upload`; `@vercel/blob/client`
   uploads image, audio, and the exact measured manifest directly to Blob. Large bodies never pass
   through a Vercel Function.
3. `/api/render-jobs` validates and stores a durable Neon job, then dispatches to RunPod.
4. The editor polls the job endpoint while the worker sends secret-authenticated progress callbacks.
5. RunPod downloads to temporary disk, uses ffprobe for real duration, renders with Remotion, and
   multipart-streams the MP4 to Blob.

There is no production in-memory job store and no browser-visible API/storage credential.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Preview works without environment variables; export stays disabled
and lists every missing variable without exposing values. For local export, `APP_BASE_URL` must be
reachable from RunPod through an HTTPS tunnel rather than localhost.

## Vercel Blob and Neon

1. Create and connect a Vercel Blob store. Keep `BLOB_READ_WRITE_TOKEN` server-only.
2. Create/connect Neon and set its pooled `DATABASE_URL`.
3. Set `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, a random 32+ character
   `RENDER_WEBHOOK_SECRET`, and canonical HTTPS `APP_BASE_URL`.
4. Optionally set `MAX_IMAGE_UPLOAD_MB`, `MAX_AUDIO_UPLOAD_MB`, and
   `MAX_AUDIO_DURATION_SECONDS` (defaults 20 MB, 200 MB, and 3600 seconds).
5. Redeploy. The first database operation idempotently creates `render_jobs`.

Accepted images are JPEG, PNG, and WebP. Accepted audio is MP3, WAV, M4A/MP4 audio, and AAC.
Blob enforces MIME and size from its generated upload token at storage ingress.

## RunPod

See `worker/README.md` for exact endpoint setup. Build from the repository root:

```bash
docker build -f worker/Dockerfile -t your-registry/storyscroll-worker:latest .
docker push your-registry/storyscroll-worker:latest
```

The root context is required because the worker bundles the shared composition. Configure
`BLOB_READ_WRITE_TOKEN` on the RunPod endpoint.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm --prefix worker run build
npx playwright install chromium
npm run test:e2e
```

`npm run fixtures` generates an original PNG and synthesized WAV. The `.e2e.ts` Playwright test
covers media selection, transcript editing, preview readiness, and export validation without being
collected by Vitest.

Production E2E:

1. Upload media, edit the transcript, and verify the preview.
2. Export and observe `uploading → queued → rendering → uploading output → completed`.
3. Download and play the MP4.
4. In a non-production test, submit corrupt audio and verify failure plus retry with preserved input.

## Limits and common failures

Audio defaults to a 60-minute maximum. The shared schema default is
`DEFAULT_MAX_AUDIO_DURATION_SECONDS`; server and worker enforcement read
`MAX_AUDIO_DURATION_SECONDS` with a 3600-second fallback. The 80,000-character transcript ceiling
supports hour-long narration while keeping duplicated normalized/wrapped text safely within the
1 MB manifest envelope; the manifest schema also verifies its serialized byte size.

- Missing-variable list: set all values shown by `/api/configuration`, then redeploy.
- Blob 400: MIME or size is outside token constraints.
- Dispatch 401/404: verify RunPod key and endpoint ID.
- Stuck queued: inspect RunPod endpoint capacity.
- Callback 401: align `RENDER_WEBHOOK_SECRET`.
- Callback unreachable: correct `APP_BASE_URL` and deployment protection.
- Chromium/FFmpeg failure: use the supplied image and inspect RunPod logs.

## Privacy

This MVP uses public Blob URLs so RunPod can fetch assets reliably. URLs are hard to guess but
bearer-readable by anyone who obtains them. Sensitive deployments need private storage or
short-lived signed downloads plus retention/deletion.

Inter is bundled under SIL Open Font License 1.1; see `public/fonts/LICENSE.txt`.
