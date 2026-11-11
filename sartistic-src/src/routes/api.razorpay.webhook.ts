import { createFileRoute } from "@tanstack/react-router";

/**
 * Razorpay webhook endpoint: POST /api/razorpay/webhook
 *
 * Configure in Razorpay Dashboard → Webhooks with the events payment.captured,
 * order.paid and payment.failed, and the same secret as RAZORPAY_WEBHOOK_SECRET.
 * The handler module is loaded lazily so server-only code (service-role
 * Supabase client, secrets) never reaches the browser bundle.
 */
export const Route = createFileRoute("/api/razorpay/webhook")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }),
      POST: async ({ request }) => {
        const { handleRazorpayWebhook } = await import("@/lib/payments.server");
        return handleRazorpayWebhook(request);
      },
    },
  },
});
