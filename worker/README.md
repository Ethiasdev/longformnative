# StoryScroll RunPod worker

This queue worker uses RunPod's supported Python handler SDK as a thin process adapter and runs
the strict TypeScript renderer in Node. It downloads the public manifest, image, and audio into a
unique temporary directory, measures the real audio duration with `ffprobe`, renders exactly
`ceil(duration * 30)` frames with Remotion, streams the MP4 to Vercel Blob, calls the authenticated
app callback, and always removes temporary files.

## Build and test locally

The Docker build must use the repository root as its context:

```bash
docker build -f worker/Dockerfile -t your-registry/storyscroll-worker:latest .
docker run --rm -i \
  -e BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
  your-registry/storyscroll-worker:latest
```

For TypeScript only:

```bash
npm --prefix worker ci
npm --prefix worker run build
```

Chromium, FFmpeg/ffprobe, fonts, Node, Python, and the RunPod SDK are installed in the image.
`CHROME_PATH` defaults to `/usr/bin/chromium`.

## Deploy exactly to RunPod Serverless

1. Create a Vercel Blob store and keep its read/write token.
2. Build from the repository root with the command above.
3. Push the image: `docker push your-registry/storyscroll-worker:latest`.
4. In RunPod, open **Serverless → New Endpoint → Import from Docker Registry**.
5. Select the pushed image, a GPU worker type, queue delay/idle timeout appropriate for your
   expected traffic, and enough container disk for Chromium plus input/output media (20 GB is a
   practical starting point).
6. Add the worker environment variable `BLOB_READ_WRITE_TOKEN`. Optionally set
   `MAX_AUDIO_DURATION_SECONDS` (default `3600`). Do not bake secrets into the image.
7. Deploy the endpoint and copy its endpoint ID.
8. In the Vercel app, set `RUNPOD_ENDPOINT_ID`, `RUNPOD_API_KEY`, and the other values from the
   root `.env.example`. `APP_BASE_URL` must be the public HTTPS production origin.
9. Redeploy the Vercel app, then verify `/api/configuration` returns `configured: true`.

RunPod supplies its own handler queue environment variables to the Python SDK. The app dispatches
with the RunPod API key. Worker-to-app callbacks use `Authorization: Bearer
<RENDER_WEBHOOK_SECRET>`, compared in constant time.

## Rendering contract

- Input is Zod validated: UUID job ID, five URLs/secret fields, and a secret of at least 32 chars.
- The downloaded JSON manifest is validated again.
- Audio duration comes from ffprobe, not browser metadata.
- Output is H.264, `yuv420p`, AAC, CRF 18, medium preset, with MP4 `faststart`.
- Render progress is sent in best-effort increments; terminal callbacks are required.
- MP4 upload uses a file read stream and Blob multipart upload, never a whole-file buffer.
- Errors are returned in a structured form and reported to the app before cleanup.

The shared schema and worker default to 3600 seconds. The worker reads
`MAX_AUDIO_DURATION_SECONDS`, and validates both the manifest and ffprobe duration against it.
Upload byte limits are independent and configured by the app's optional max-size variables.

## Common failures

- **Callback 401**: worker payload and Vercel `RENDER_WEBHOOK_SECRET` differ.
- **Callback/network failure**: `APP_BASE_URL` is localhost, protected, or not HTTPS in production.
- **Blob upload failure**: the worker lacks `BLOB_READ_WRITE_TOKEN` or the store is suspended.
- **Chromium launch failure**: keep `CHROME_PATH=/usr/bin/chromium` and the Docker dependencies.
- **Audio duration failure**: unsupported/corrupt media or duration over the shared maximum.
- **Out of disk/memory**: increase container disk/RAM or reduce accepted upload/duration limits.
- **Stale image**: push an immutable image tag and update the endpoint template.

## Privacy

The MVP uses public Vercel Blob URLs so RunPod can fetch assets without expiring signed-download
machinery. Anyone who obtains an unguessable URL can read that asset. Do not use this design for
sensitive media without private storage or signed, short-lived download URLs and deletion policy.
