import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled Shiprocket tracking refresh: GET or POST /api/cron/sync-tracking
 * with `Authorization: Bearer <CRON_SECRET>`. A safety net for missed
 * webhooks; see handleTrackingCron. Loaded lazily so server-only code never
 * reaches the browser bundle.
 */
async function run(request: Request) {
  const { handleTrackingCron } = await import("@/lib/tracking.server");
  return handleTrackingCron(request);
}

export const Route = createFileRoute("/api/cron/sync-tracking")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
