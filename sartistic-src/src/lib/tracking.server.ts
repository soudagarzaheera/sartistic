/**
 * Server-only: keeps an order's shipment data in step with Shiprocket.
 * Load with `await import("@/lib/tracking.server")` inside server handlers.
 *
 * Two Shiprocket sources are combined:
 *  - the order record (GET /orders/show) — courier, AWB and pickup, which is
 *    the only information that exists before the courier first scans the
 *    parcel;
 *  - the tracking API (by AWB) — scan history, status, ETD, track URL.
 *
 * Shiprocket's `tracking_data` is saved exactly as returned; a summary is
 * copied into columns for lists. Nothing is invented: without an AWB there is
 * no tracking number or link. An older reading never overwrites a newer one.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { shiprocketRequest, ShiprocketApiError } from "@/lib/shiprocket.server";
import { logShiprocket } from "@/lib/shipment.server";
import {
  autoAdvanceFrom,
  buildTimeline,
  canAutoAdvance,
  isTrackingFinal,
  parseShiprocketOrder,
  parseWebhookTime,
  parseTracking,
  statusFromTracking,
  type ShiprocketOrderSnapshot,
} from "@/lib/tracking";

const LOG = "[tracking]";

export type SyncResult =
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

function apiReason(err: unknown) {
  return err instanceof ShiprocketApiError
    ? `Shiprocket: ${err.detail}`
    : "Couldn't reach Shiprocket. It may be temporarily unavailable.";
}

export async function syncOrderTracking(
  orderId: string,
  { minIntervalMs }: { minIntervalMs: number },
): Promise<SyncResult> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, status, shiprocket_order_id, shiprocket_shipment_id, shiprocket_awb, shiprocket_courier, shiprocket_status_at, tracking_synced_at, awb_assigned_at, pickup_scheduled_at",
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

  // 1. Shiprocket's order record: courier, AWB and pickup. Needed until both
  //    the AWB and the pickup are known (they're invisible to the tracking API).
  let snapshot: ShiprocketOrderSnapshot | null = null;
  if (!order.shiprocket_awb || !order.pickup_scheduled_at) {
    try {
      snapshot = parseShiprocketOrder(
        await shiprocketRequest<unknown>(
          `/orders/show/${encodeURIComponent(order.shiprocket_order_id)}`,
          { method: "GET" },
        ),
      );
    } catch (err) {
      const reason = apiReason(err);
      console.error(`${LOG} ${order.order_number}: order lookup failed: ${reason}`);
      await logShiprocket({ order_id: order.id, kind: "sync", outcome: "error", message: reason });
      return { outcome: "unavailable", reason };
    }
  }

  const awb = order.shiprocket_awb ?? snapshot?.awb ?? null;
  const now = new Date().toISOString();
  const update: TablesUpdate<"orders"> = { tracking_synced_at: now };

  if (snapshot) {
    if (!order.shiprocket_awb && snapshot.awb) {
      update.shiprocket_awb = snapshot.awb;
      update.awb_assigned_at = order.awb_assigned_at ?? now;
    }
    if (snapshot.courier && snapshot.courier !== order.shiprocket_courier) {
      update.shiprocket_courier = snapshot.courier;
    }
    if (!order.pickup_scheduled_at && snapshot.pickupScheduledAt) {
      update.pickup_scheduled_at = snapshot.pickupScheduledAt.toISOString();
      update.pickup_token = snapshot.pickupToken;
    }
  }

  // 2. Tracking API. Without an AWB there is nothing for it to track.
  let raw: Record<string, unknown> | null = null;
  let parsed: ReturnType<typeof parseTracking> = null;
  let trackingError: string | null = null;
  if (awb) {
    try {
      raw = extractTrackingData(
        await shiprocketRequest<unknown>(`/courier/track/awb/${encodeURIComponent(awb)}`, {
          method: "GET",
        }),
      );
      parsed = raw ? parseTracking(raw) : null;
      if (!raw) trackingError = "Shiprocket returned no tracking data.";
    } catch (err) {
      trackingError = apiReason(err);
      console.error(`${LOG} ${order.order_number}: tracking failed: ${trackingError}`);
      await logShiprocket({ order_id: order.id, kind: "sync", outcome: "error", message: trackingError });
    }
  }

  // 3. Never let an older reading replace a newer one (out-of-order webhooks,
  //    a lagging API node). Scan times are the ordering key.
  const latestAt = parsed?.events.find((e) => e.at)?.at ?? null;
  const storedAt = order.shiprocket_status_at ? new Date(order.shiprocket_status_at) : null;
  const olderThanStored = Boolean(storedAt && (!latestAt || latestAt < storedAt));

  if (raw && parsed && !olderThanStored) {
    Object.assign(update, {
      shiprocket_tracking: raw as Json,
      shiprocket_status: parsed.currentStatus ?? snapshot?.status ?? null,
      shiprocket_status_code: parsed.currentCode,
      shiprocket_etd: typeof raw["etd"] === "string" ? raw["etd"] : null,
      shiprocket_track_url: parsed.trackUrl,
      shiprocket_courier: parsed.courier ?? update.shiprocket_courier ?? order.shiprocket_courier,
      shiprocket_status_at: latestAt?.toISOString() ?? order.shiprocket_status_at,
    });
    if (!order.shiprocket_awb && !update.shiprocket_awb && parsed.awb) {
      update.shiprocket_awb = parsed.awb;
      update.awb_assigned_at = now;
    }
  } else if (!storedAt && snapshot?.status) {
    // No courier scans yet: Shiprocket's own order status (NEW, READY TO SHIP,
    // PICKUP SCHEDULED, CANCELED…) is the best current status there is.
    update.shiprocket_status = snapshot.status;
  }

  // Nothing new was read (API down): leave the last sync time alone so the
  // next page view / cron run retries promptly.
  if (trackingError && !snapshot) return { outcome: "unavailable", reason: trackingError };

  const { error: saveError } = await supabaseAdmin.from("orders").update(update).eq("id", order.id);
  if (saveError) {
    throw new Error(`${LOG} Failed to save tracking for ${orderId}: ${saveError.message}`);
  }

  let orderStatus: string | null = null;
  if (parsed && !olderThanStored) {
    const proven = statusFromTracking(parsed);
    if (proven === "delivered") await recordDeliveredAt(order, parsed);
    orderStatus = await advanceOrderStatus(order, proven);
  }
  return {
    outcome: "synced",
    status: (update.shiprocket_status as string | null | undefined) ?? null,
    orderStatus,
  };
}

/**
 * Stores when Shiprocket says the parcel was delivered — the start of the
 * return/refund window. Uses Shiprocket's delivered_date, or failing that the
 * time of its earliest "delivered" scan; with neither, nothing is stored (the
 * customer is told the delivery date is unavailable rather than guessing).
 *
 * Written once: the update only matches while delivered_at is still empty,
 * so webhook retries and duplicate delivery events never move the window.
 */
async function recordDeliveredAt(
  order: { id: string; order_number: string },
  parsed: ReturnType<typeof parseTracking>,
) {
  const deliveryScans = (parsed?.events ?? [])
    .filter((e) => e.stage === "delivery" && !e.exception && e.at)
    .map((e) => e.at!.getTime());
  const fromScan = deliveryScans.length ? new Date(Math.min(...deliveryScans)) : null;
  const deliveredAt = parsed?.deliveredDate ?? fromScan;
  if (!deliveredAt) {
    console.warn(`${LOG} ${order.order_number}: delivered, but Shiprocket gave no delivery date`);
    return;
  }
  // A clock-skewed future date must never stretch the window.
  const at = new Date(Math.min(deliveredAt.getTime(), Date.now()));

  const { error } = await supabaseAdmin
    .from("orders")
    .update({ delivered_at: at.toISOString() })
    .eq("id", order.id)
    .is("delivered_at", null);
  if (error) {
    console.error(`${LOG} ${order.order_number}: couldn't save delivery date: ${error.message}`);
  }
}

/**
 * Moves the order's own status forward to match Shiprocket (processing →
 * shipped → delivered). Never moves backwards, never touches pending
 * (unpaid), cancelled or refunded orders, and never changes payment status —
 * a COD order stays unpaid until an admin records the collection. "Shipped"
 * needs a real courier pickup/transit scan; packing or an AWB alone is not
 * enough.
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

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const asId = (v: unknown) =>
  (typeof v === "string" && v.trim()) || typeof v === "number" ? String(v).trim() : null;

/**
 * Shiprocket tracking webhook. Shiprocket sends the token configured in its
 * dashboard in the `x-api-key` header; it must equal SHIPROCKET_WEBHOOK_TOKEN.
 *
 * Every authenticated delivery is logged (shiprocket_logs). Identical events
 * (same shipment, status and timestamp) are processed once. The payload only
 * identifies the order: tracking is then re-read from Shiprocket's API, and
 * the sync refuses readings older than what is stored, so retried or
 * out-of-order events can't roll the status back. Shiprocket expects a 200
 * for every delivery, including ignored ones.
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

  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return ok({ ok: true, ignored: "invalid json" });
  }

  const awb = asId(payload["awb"]);
  const srOrderId = asId(payload["sr_order_id"]);
  const channelOrderId = asId(payload["order_id"]); // our order number
  const status = asId(payload["current_status"]) ?? asId(payload["shipment_status"]);
  const statusId = asId(payload["current_status_id"]) ?? asId(payload["shipment_status_id"]);
  const eventAt = parseWebhookTime(payload["current_timestamp"]);

  // Find the order: AWB, then Shiprocket order id, then our order number.
  let orderId: string | null = null;
  for (const [column, value] of [
    ["shiprocket_awb", awb],
    ["shiprocket_order_id", srOrderId],
    ["order_number", channelOrderId],
  ] as const) {
    if (!value || orderId) continue;
    const { data } = await supabaseAdmin.from("orders").select("id").eq(column, value).limit(1);
    orderId = data?.[0]?.id ?? null;
  }

  const dedupeKey = `${awb ?? srOrderId ?? channelOrderId ?? "?"}|${statusId ?? status ?? "?"}|${
    eventAt ? eventAt.toISOString() : await sha256Hex(rawBody)
  }`;
  const { data: logged, error: logError } = await supabaseAdmin
    .from("shiprocket_logs")
    .insert({
      order_id: orderId,
      kind: "webhook",
      outcome: orderId ? "ok" : "ignored",
      message: orderId ? null : "No matching order",
      shiprocket_status: status,
      event_at: eventAt?.toISOString() ?? null,
      dedupe_key: dedupeKey,
      payload: payload as Json,
    })
    .select("id")
    .maybeSingle();
  if (logError?.code === "23505") return ok({ ok: true, outcome: "duplicate" });
  if (logError) console.error(`${LOG} Couldn't log webhook: ${logError.message}`);
  if (!orderId) return ok({ ok: true, ignored: "unknown shipment" });

  let outcome: string;
  let message: string | null = null;
  try {
    // Distinct events are each worth a fresh read; the dedupe above already
    // drops repeats, so only bursts within a few seconds are collapsed.
    const result = await syncOrderTracking(orderId, { minIntervalMs: 5 * 1000 });
    outcome = result.outcome;
    if (result.outcome === "unavailable") message = result.reason;
  } catch (err) {
    console.error(`${LOG} Webhook sync failed for ${orderId}:`, err);
    outcome = "error";
    message = err instanceof Error ? err.message : String(err);
  }
  if (logged?.id) {
    await supabaseAdmin
      .from("shiprocket_logs")
      .update({
        outcome: outcome === "error" || outcome === "unavailable" ? "error" : "ok",
        message: message ?? `sync: ${outcome}`,
      })
      .eq("id", logged.id);
  }
  return ok({ ok: true, outcome });
}

// ---------------------------------------------------------------------------
// Scheduled refresh
// ---------------------------------------------------------------------------

const CRON_STALE_MS = 25 * 60 * 1000;
const CRON_BATCH = 25;
const CRON_MAX_AGE_DAYS = 45;

/**
 * GET/POST /api/cron/sync-tracking — refreshes active shipments in case a
 * webhook was missed (or webhooks aren't configured). Requires
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this automatically
 * when CRON_SECRET is set; the GitHub Actions workflow sends it too).
 */
export async function handleTrackingCron(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return new Response("CRON_SECRET is not set", { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });

  const staleBefore = new Date(Date.now() - CRON_STALE_MS).toISOString();
  const since = new Date(Date.now() - CRON_MAX_AGE_DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, status, payment_method, payment_status, created_at, delivered_at, shiprocket_order_id, shiprocket_awb, shiprocket_status, shiprocket_courier, shiprocket_etd, shiprocket_track_url, shiprocket_tracking, shipment_created_at, tracking_synced_at",
    )
    .not("shiprocket_order_id", "is", null)
    .not("status", "in", "(cancelled,refunded)")
    .gte("created_at", since)
    .or(`tracking_synced_at.is.null,tracking_synced_at.lt.${staleBefore}`)
    .order("tracking_synced_at", { ascending: true, nullsFirst: true })
    .limit(CRON_BATCH * 2);
  if (error) {
    console.error(`${LOG} cron query failed: ${error.message}`);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }

  // Skip shipments whose story is over (delivered with a delivery date, returned, lost…).
  const due = (rows ?? [])
    .filter((o) => {
      if (!o.tracking_synced_at) return true;
      const final = isTrackingFinal(buildTimeline(o));
      return !final || (o.status === "delivered" && !o.delivered_at);
    })
    .slice(0, CRON_BATCH);

  const counts: Record<string, number> = {};
  for (const o of due) {
    let outcome: string;
    try {
      outcome = (await syncOrderTracking(o.id, { minIntervalMs: CRON_STALE_MS })).outcome;
    } catch (err) {
      console.error(`${LOG} cron sync failed for ${o.order_number}:`, err);
      outcome = "error";
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  console.info(`${LOG} cron: ${due.length} orders checked`, counts);
  return new Response(JSON.stringify({ ok: true, checked: due.length, ...counts }), {
    headers: { "content-type": "application/json" },
  });
}
