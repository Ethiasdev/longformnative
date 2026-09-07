# StoryScroll

A private single-user Next.js editor that turns one vertical image, one ElevenLabs
narration file, and a pasted transcript into a 1080x1920 MP4. Credits scroll with a
linear `translate3d` path. Export defaults to 60 FPS for smoother movement; 30 FPS
is available for faster renders.

## Architecture

1. The editor measures and previews the credits locally with Remotion.
2. Image and audio upload directly to Vercel Blob. Large files never pass through a Vercel function body.
3. The browser posts the Blob URLs, transcript, duration, and styling to `/api/render-jobs`.
4. That route dispatches a RunPod Serverless job and returns the RunPod job ID.
5. React keeps the job ID in memory and polls `/api/render-jobs/[id]`, which reads live frame progress from the RunPod status API.
6. The worker downloads the assets, renders with Remotion/FFmpeg, uploads the MP4 to Blob, and returns the URL.

There is no database, no `render_jobs` table, and no webhook callback.

## Required environment variables

Preview works with none of these set. Export stays disabled and names the missing variables.

| Variable | Where it comes from |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Dashboard → Storage → Blob, or `vercel env pull`. Also set this on the RunPod endpoint so the worker can upload the MP4. |
| `RUNPOD_API_KEY` | RunPod dashboard → Settings → API Keys. Used only on the Vercel server to start and poll jobs. |
| `RUNPOD_ENDPOINT_ID` | The ID of the deployed Serverless endpoint (`…/v2/<id>/run`). |

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_IMAGE_UPLOAD_MB` | `20` | Image upload ceiling |
| `MAX_AUDIO_UPLOAD_MB` | `200` | Audio upload ceiling |
| `MAX_AUDIO_DURATION_SECONDS` | `3600` | Shared 60-minute limit. Change this to raise or lower the cap. |

Do not set `DATABASE_URL`, `RENDER_WEBHOOK_SECRET`, or `APP_BASE_URL`. They are unused.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. You can preview without credentials. For a real export, fill the three required variables and deploy the worker.

## Vercel

1. Create or connect a Vercel Blob store to this project.
2. Confirm `BLOB_READ_WRITE_TOKEN` is present in the project environment.
3. Add `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` after the worker is deployed.
4. Redeploy. `/api/configuration` should return `configured: true`.

Accepted images: JPEG, PNG, WebP. Accepted audio: MP3, WAV, M4A/MP4 audio, AAC.

## RunPod

See `worker/README.md`. Build from the repository root:

```bash
docker build -f worker/Dockerfile -t your-registry/storyscroll-worker:latest .
docker push your-registry/storyscroll-worker:latest
```

The worker only needs `BLOB_READ_WRITE_TOKEN` (and optionally `MAX_AUDIO_DURATION_SECONDS`).

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm --prefix worker run build
npx playwright install chromium
npm run test:e2e
npm run motion:samples
```

`npm run fixtures` generates an original PNG and WAV for the browser test.
`npm run motion:samples` writes short 30 and 60 FPS MP4s to `motion-samples/` using the same scroll formula.

Production export:

1. Add image, audio, and transcript, then confirm the 9:16 preview.
2. Export and watch `uploading → queued → rendering → completed`.
3. Download the MP4.
4. Retry after a failure; the transcript and files stay in the editor.

## Common failures

- Missing-variable list: set the three required values and redeploy.
- Blob 400: MIME type or file size is outside the token limits.
- Dispatch 401/404: check `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID`.
- Stuck queued: inspect RunPod endpoint capacity and logs.
- Chromium/FFmpeg failure: use the supplied Docker image and read RunPod logs.
- Rendering progress now comes from Remotion rather than a fixed placeholder. The worker uses
  x264 `veryfast` at CRF 18 to keep long CPU renders practical without changing resolution.

## Privacy

This MVP uses public Blob URLs so RunPod can fetch assets. Anyone who obtains a URL can read that file.

Inter is bundled under the SIL Open Font License 1.1; see `public/fonts/LICENSE.txt`.
