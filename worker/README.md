# StoryScroll RunPod worker

RunPod Serverless handler that downloads public Vercel Blob image/audio URLs, probes duration
with ffprobe, generates deterministic ASS credit lines, and renders the MP4 directly with FFmpeg.
The interactive web preview still uses Remotion, but the cloud worker avoids Chromium's
frame-by-frame overhead. It returns the output URL in the job result. The Next.js app polls
RunPod for that result. There is no webhook and no database.

## Build

The Docker build must use the repository root as its context:

```bash
docker build -f worker/Dockerfile -t your-registry/storyscroll-worker:latest .
docker push your-registry/storyscroll-worker:latest
```

TypeScript only:

```bash
npm --prefix worker ci
npm --prefix worker run build
```

The image includes FFmpeg/ffprobe with libass, Inter, Node, Python, and the RunPod SDK.

## Deploy to RunPod Serverless

1. Push the image from the repository root.
2. In RunPod: **Serverless → New Endpoint → Import from Docker Registry**.
3. Choose enough container disk for Chromium plus long audio (20 GB is a practical start).
4. Set worker env `BLOB_READ_WRITE_TOKEN`. Optionally set `MAX_AUDIO_DURATION_SECONDS` (default `3600`).
5. Deploy and copy the endpoint ID into the Vercel app as `RUNPOD_ENDPOINT_ID`.
6. Put a RunPod API key in Vercel as `RUNPOD_API_KEY`.

## Example request

The Vercel route posts this body to `https://api.runpod.ai/v2/<RUNPOD_ENDPOINT_ID>/run`:

```json
{
  "input": {
    "imageUrl": "https://example.blob.vercel-storage.com/image.png",
    "audioUrl": "https://example.blob.vercel-storage.com/narration.mp3",
    "transcript": "Every great story begins with a moment.\n\nThen it continues.",
    "durationSeconds": 12.5,
    "fps": 60,
    "settings": {
      "fontSize": 68,
      "textColumnWidth": 860,
      "lineHeight": 1.22,
      "paragraphGap": 34,
      "outlineWidth": 5,
      "backgroundDarkening": 0.2,
      "imageVerticalFocalPosition": 50
    },
    "wrapped": {
      "blocks": [
        { "kind": "text", "source": "Every great story begins with a moment.", "lines": ["Every great story begins", "with a moment."] },
        { "kind": "spacer" },
        { "kind": "text", "source": "Then it continues.", "lines": ["Then it continues."] }
      ],
      "lineCount": 4,
      "textHeight": 331.84
    }
  }
}
```

## Example result

Successful RunPod `COMPLETED` output:

```json
{
  "ok": true,
  "outputUrl": "https://example.blob.vercel-storage.com/storyscroll.mp4",
  "frames": 750
}
```

Failed jobs raise a structured error that the Vercel poll route surfaces in the editor.

## Common failures

- **Blob upload failure**: the worker is missing `BLOB_READ_WRITE_TOKEN`.
- **Subtitle filter failure**: use the supplied Debian FFmpeg image, which includes libass.
- **Audio duration failure**: corrupt media or duration over `MAX_AUDIO_DURATION_SECONDS`.
- **Out of disk/memory**: increase the endpoint disk/RAM.
