/**
 * Server-only: pulls tracking for one order from Shiprocket and stores it.
 * Load with `await import("@/lib/tracking.server")` inside server handlers.
 *
 * Shiprocket's `tracking_data` is saved exactly as returned; a summary
 * (status, courier, ETD, AWB) is copied into columns for lists. Calls are
 * throttled per order, so page views and webhook bursts don't hammer the API.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { shiprocketRequest, ShiprocketApiError } from "@/lib/shiprocket.server";
import {
  autoAdvanceFrom,
  canAutoAdvance,
  parseTracking,
  statusFromTracking,
} from "@/lib/tracking";

const LOG = "[tracking]";

type SyncResult =
  | { outcome: "synced"; status: string | null; orderStatus: string | null }
  | { outcome: "fresh" }
  | { outcome: "no_shipment" }
  | { outcome: "unavailable"; reason: string };

/** Finds the `tracking_data` object whatever wrapper the endpoint used. */
function extractTrackingData(body: unknown): Record<string, unknown> | null {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!body) return null;
  if (Array.isArray(body)) {
    for (const item of body) {
      const found = extractTrackingData(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(body)) return null;
  if (isObj(body["tracking_data"])) return body["tracking_data"];
  // Shipment endpoint can key the result by shipment id: { "123": { tracking_data } }
  for (const value of Object.values(body)) {
    if (isObj(value) && isObj(value["tracking_data"])) return value["tracking_data"];
  }
  return null;
}

export async function syncOrderTracking(
  orderId: string,
  { minIntervalMs }: { minIntervalMs: number },
): Promise<SyncResult> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, status, shiprocket_order_id, shiprocket_shipment_id, shiprocket_awb, shiprocket_courier, tracking_synced_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`${LOG} Failed to load order ${orderId}: ${error.message}`);
  if (!order || !order.shiprocket_order_id) return { outcome: "no_shipment" };

  if (
    order.tracking_synced_at &&
    Date.now() - new Date(order.tracking_synced_at).getTime() < minIntervalMs
  ) {
    return { outcome: "fresh" };
  }

  const endpoint = order.shiprocket_awb
    ? `/courier/track/awb/${encodeURIComponent(order.shiprocket_awb)}`
    : order.shiprocket_shipment_id
      ? `/courier/track/shipment/${encodeURIComponent(order.shiprocket_shipment_id)}`
      : null;
  if (!endpoint) return { outcome: "unavailable", reason: "No AWB or shipment id yet." };

  let body: unknown;
  try {
    body = await shiprocketRequest<unknown>(endpoint, { method: "GET" });
  } catch (err) {
    const reason =
      err instanceof ShiprocketApiError ? err.detail : "Couldn't reach Shiprocket.";
    console.error(`${LOG} ${order.order_number}: ${err instanceof Error ? err.message : err}`);
    return { outcome: "unavailable", reason };
  }

  const raw = extractTrackingData(body);
  if (!raw) {
    console.warn(`${LOG} ${order.order_number}: unrecognised tracking response`);
    return { outcome: "unavailable", reason: "Shiprocket returned no tracking data." };
  }

  const parsed = parseTracking(raw);
  const update = {
    shiprocket_tracking: raw as Json,
    shiprocket_status: parsed?.currentStatus ?? null,
    shiprocket_status_code: parsed?.currentCode ?? null,
    shiprocket_etd: typeof raw["etd"] === "string" ? raw["etd"] : null,
    shiprocket_track_url: parsed?.trackUrl ?? null,
    shiprocket_courier: parsed?.courier ?? order.shiprocket_courier,
    tracking_synced_at: new Date().toISOString(),
    // Fill in the AWB once the courier assigns one; never overwrite an existing one.
    ...(!order.shiprocket_awb && parsed?.awb ? { shiprocket_awb: parsed.awb } : {}),
  };

  const { error: saveError } = await supabaseAdmin
    .from("orders")
    .update(update)
    .eq("id", order.id);
  if (saveError) throw new Error(`${LOG} Failed to save tracking for ${orderId}: ${saveError.message}`);

  const orderStatus = await advanceOrderStatus(order, statusFromTracking(parsed));
  return { outcome: "synced", status: update.shiprocket_status, orderStatus };
}

/**
 * Moves the order's own status forward to match Shiprocket (processing →
 * shipped → delivered). Never moves backwards, never touches pending
 * (unpaid), cancelled or refunded orders, and never changes payment status —
 * a COD order stays unpaid until an admin records the collection.
 *
 * The update is conditional on the status still being one it may advance
 * from, so it can't overwrite a change an admin made at the same moment. The
 * existing history trigger logs the change as "automatic".
 */
async function advanceOrderStatus(
  order: { id: string; order_number: string; status: string },
  next: ReturnType<typeof statusFromTracking>,
): Promise<string | null> {
  if (!next || !canAutoAdvance(order.status, next)) return null;

  const { data: moved, error } = await supabaseAdmin
    .from("orders")
    .update({ status: next })
    .eq("id", order.id)
    .in("status", autoAdvanceFrom(next))
    .select("id");
  if (error) {
    // Tracking itself is saved; the status can catch up on the next sync.
    console.error(`${LOG} ${order.order_number}: status update to ${next} failed: ${error.message}`);
    return null;
  }
  if (moved?.length === 1) {
    console.info(`${LOG} ${order.order_number}: ${order.status} → ${next} (from Shiprocket)`);
    return next;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ok(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Shiprocket tracking webhook. Shiprocket sends the token configured in its
 * dashboard in the `x-api-key` header; it must equal SHIPROCKET_WEBHOOK_TOKEN.
 *
 * The payload is only used to identify the order: tracking is then re-read
 * from Shiprocket's API, so the stored data always comes from the API itself.
 * Shiprocket expects a 200 for every delivery, including ignored ones.
 */
export async function handleShiprocketWebhook(request: Request): Promise<Response> {
  const expected = process.env["SHIPROCKET_WEBHOOK_TOKEN"];
  if (!expected) {
    console.error(`${LOG} SHIPROCKET_WEBHOOK_TOKEN is not set; webhook ignored`);
    return new Response("Webhook not configured", { status: 503 });
  }
  const token = request.headers.get("x-api-key") ?? "";
  if (!safeEqual(token, expected)) {
    console.warn(`${LOG} Webhook with invalid token`);
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return ok({ ok: true, ignored: "invalid json" });
  }

  const awb = typeof payload["awb"] === "string" || typeof payload["awb"] === "number"
    ? String(payload["awb"])
    : null;
  const srOrderId = payload["sr_order_id"] != null ? String(payload["sr_order_id"]) : null;

  let query = supabaseAdmin.from("orders").select("id").limit(1);
  if (awb) query = query.eq("shiprocket_awb", awb);
  else if (srOrderId) query = query.eq("shiprocket_order_id", srOrderId);
  else return ok({ ok: true, ignored: "no identifiers" });

  let { data: rows } = await query;
  if ((!rows || rows.length === 0) && awb && srOrderId) {
    // AWB not stored yet (assigned in Shiprocket after creation): match the order id.
    ({ data: rows } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("shiprocket_order_id", srOrderId)
      .limit(1));
  }
  const orderId = rows?.[0]?.id;
  if (!orderId) return ok({ ok: true, ignored: "unknown shipment" });

  try {
    // Bursts of events for the same shipment collapse into one API call a minute.
    const result = await syncOrderTracking(orderId, { minIntervalMs: 60 * 1000 });
    return ok({ ok: true, outcome: result.outcome });
  } catch (err) {
    console.error(`${LOG} Webhook sync failed for ${orderId}:`, err);
    return ok({ ok: true, outcome: "error" });
  }
}
