import { createFileRoute } from "@tanstack/react-router";

/**
 * Shiprocket tracking webhook endpoint: POST /api/shipment-updates
 *
 * Configure in Shiprocket → Settings → API → Webhooks with this URL and a
 * token equal to SHIPROCKET_WEBHOOK_TOKEN. (Shiprocket rejects webhook URLs
 * containing words like "shiprocket", hence the neutral path.) The handler is
 * loaded lazily so server-only code never reaches the browser bundle.
 */
export const Route = createFileRoute("/api/shipment-updates")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }),
      POST: async ({ request }) => {
        const { handleShiprocketWebhook } = await import("@/lib/tracking.server");
        return handleShiprocketWebhook(request);
      },
    },
  },
});
