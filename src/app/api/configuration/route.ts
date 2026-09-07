import {
  getConfigurationStatus,
  getMaxAudioDurationSeconds,
} from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ...getConfigurationStatus(),
    maxAudioDurationSeconds: getMaxAudioDurationSeconds(),
  }, {
    headers: { "cache-control": "no-store" },
  });
}
