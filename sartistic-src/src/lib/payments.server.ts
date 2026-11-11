/**
 * Server-only payment helpers shared by the checkout server functions and the
 * Razorpay webhook. Uses the service-role Supabase client, so this module must
 * only ever be loaded from server code (via `await import(...)` inside a
 * server function handler or server route handler).
 *
 * All state transitions are conditional updates, which makes them idempotent:
 * replaying the same verification or webhook event never double-processes an
 * order or overwrites a final state.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LOG = "[payments]";

export async function hmacSha256Hex(secret: string, message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison so signature checks don't leak timing information. */
export function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type MarkPaidResult =
  | { outcome: "updated" }
  | { outcome: "already_paid" }
  | { outcome: "not_payable"; paymentStatus: string | null; status: string | null };

/**
 * Marks an order paid + confirmed for a verified Razorpay payment.
 *
 * Only orders whose payment_status is "pending" or "failed" can become paid:
 * Razorpay lets a customer retry on the same order, so an earlier failed
 * attempt (payment.failed) may be followed by a successful one. Orders that
 * are already paid, refunded, cancelled or refunded-status are never touched.
 */
export async function markOrderPaid(input: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** When set, the update is additionally scoped to this customer. */
  userId?: string;
}): Promise<MarkPaidResult> {
  let query = supabaseAdmin
    .from("orders")
    .update({
      payment_status: "paid",
      status: "confirmed",
      razorpay_payment_id: input.razorpayPaymentId,
    })
    .eq("id", input.orderId)
    .eq("razorpay_order_id", input.razorpayOrderId)
    .in("payment_status", ["pending", "failed"])
    .not("status", "in", "(cancelled,refunded)");
  if (input.userId) query = query.eq("user_id", input.userId);

  const { data: updated, error } = await query.select("id");
  if (error) {
    throw new Error(`${LOG} Failed to mark order ${input.orderId} paid: ${error.message}`);
  }
  if (updated && updated.length === 1) return { outcome: "updated" };

  // Nothing matched: either already paid (duplicate/concurrent request) or the
  // order is in a state that must not be changed automatically.
  const { data: current, error: readError } = await supabaseAdmin
    .from("orders")
    .select("payment_status, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (readError) {
    throw new Error(`${LOG} Failed to re-read order ${input.orderId}: ${readError.message}`);
  }
  if (current?.payment_status === "paid") return { outcome: "already_paid" };
  return {
    outcome: "not_payable",
    paymentStatus: current?.payment_status ?? null,
    status: current?.status ?? null,
  };
}

/**
 * Marks an order's payment failed. Only applies to "pending" orders, so it can
 * never downgrade a paid order, even if events arrive out of order.
 * Returns true when a row changed.
 */
export async function markOrderPaymentFailed(input: {
  orderId: string;
  razorpayOrderId: string;
}): Promise<boolean> {
  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "failed" })
    .eq("id", input.orderId)
    .eq("razorpay_order_id", input.razorpayOrderId)
    .eq("payment_status", "pending")
    .select("id");
  if (error) {
    throw new Error(`${LOG} Failed to mark order ${input.orderId} failed: ${error.message}`);
  }
  return (updated?.length ?? 0) === 1;
}

type OrderForPayment = {
  id: string;
  total: number;
  currency: string;
  payment_status: string;
  razorpay_order_id: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds the Sartistic order for a Razorpay order id.
 *
 * Falls back to the `order_id` note that createCheckoutOrder attaches to the
 * Razorpay order, for orders whose razorpay_order_id was never saved (orders
 * placed before the RLS fix). That fallback only links orders that have no
 * Razorpay order id yet, and only from a signature-verified webhook payload.
 */
export async function findOrderForRazorpayOrder(
  razorpayOrderId: string,
  notesOrderId: string | null,
): Promise<OrderForPayment | null> {
  const columns = "id, total, currency, payment_status, razorpay_order_id";

  const { data: byRef, error } = await supabaseAdmin
    .from("orders")
    .select(columns)
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (error) throw new Error(`${LOG} Order lookup failed: ${error.message}`);
  if (byRef) return byRef;

  if (!notesOrderId || !UUID_RE.test(notesOrderId)) return null;

  const { data: linked, error: linkError } = await supabaseAdmin
    .from("orders")
    .update({ razorpay_order_id: razorpayOrderId })
    .eq("id", notesOrderId)
    .is("razorpay_order_id", null)
    .select(columns);
  if (linkError) throw new Error(`${LOG} Order link failed: ${linkError.message}`);
  if (linked && linked.length === 1) {
    console.warn(`${LOG} Linked legacy order ${notesOrderId} to Razorpay order ${razorpayOrderId}`);
    return linked[0]!;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  status?: string;
  notes?: Record<string, unknown> | unknown[];
};

type RazorpayOrderEntity = {
  id?: string;
  notes?: Record<string, unknown> | unknown[];
};

type RazorpayWebhookEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    order?: { entity?: RazorpayOrderEntity };
  };
};

const WEBHOOK_LOG = "[razorpay-webhook]";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noteOrderId(notes: RazorpayPaymentEntity["notes"]): string | null {
  // Razorpay sends `notes: []` when empty.
  if (!notes || Array.isArray(notes)) return null;
  const value = notes["order_id"];
  return typeof value === "string" ? value : null;
}

/**
 * Handles a Razorpay webhook request.
 *
 * Status codes: 2xx = handled or deliberately ignored (Razorpay stops
 * retrying); 400 = bad signature/payload; 500 = transient server problem
 * (Razorpay retries, which is safe because every transition is idempotent).
 */
export async function handleRazorpayWebhook(request: Request): Promise<Response> {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret) {
    console.error(`${WEBHOOK_LOG} RAZORPAY_WEBHOOK_SECRET is not set`);
    return json(500, { error: "Webhook not configured" });
  }

  const eventId = request.headers.get("x-razorpay-event-id") ?? "unknown";
  const signature = request.headers.get("x-razorpay-signature");
  // The signature covers the exact raw body, so read it before parsing.
  const rawBody = await request.text();

  if (!signature) {
    console.warn(`${WEBHOOK_LOG} Missing signature (event ${eventId})`);
    return json(400, { error: "Missing signature" });
  }
  const expected = await hmacSha256Hex(secret, rawBody);
  if (!timingSafeEqualHex(expected, signature)) {
    console.warn(`${WEBHOOK_LOG} Invalid signature (event ${eventId})`);
    return json(400, { error: "Invalid signature" });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    console.warn(`${WEBHOOK_LOG} Unparseable body (event ${eventId})`);
    return json(400, { error: "Invalid JSON" });
  }

  const type = event.event ?? "unknown";
  const payment = event.payload?.payment?.entity;
  const rzpOrder = event.payload?.order?.entity;

  try {
    switch (type) {
      case "payment.captured":
      case "order.paid":
        return await handleCaptured(eventId, type, payment, rzpOrder);
      case "payment.failed":
        return await handleFailed(eventId, payment);
      default:
        return json(200, { ok: true, ignored: type });
    }
  } catch (error) {
    console.error(
      `${WEBHOOK_LOG} Error handling ${type} (event ${eventId}):`,
      error instanceof Error ? error.message : error,
    );
    return json(500, { error: "Processing failed" });
  }
}

async function handleCaptured(
  eventId: string,
  type: string,
  payment: RazorpayPaymentEntity | undefined,
  rzpOrder: RazorpayOrderEntity | undefined,
): Promise<Response> {
  const razorpayOrderId = payment?.order_id ?? rzpOrder?.id ?? null;
  const paymentId = payment?.id ?? null;
  if (!razorpayOrderId || !paymentId) {
    console.warn(`${WEBHOOK_LOG} ${type} without order/payment id (event ${eventId})`);
    return json(200, { ok: true, ignored: "missing ids" });
  }
  if (payment?.status !== "captured") {
    console.warn(
      `${WEBHOOK_LOG} ${type} for payment ${paymentId} has status ${payment?.status} (event ${eventId})`,
    );
    return json(200, { ok: true, ignored: "not captured" });
  }

  const order = await findOrderForRazorpayOrder(
    razorpayOrderId,
    noteOrderId(rzpOrder?.notes) ?? noteOrderId(payment.notes),
  );
  if (!order) {
    console.warn(
      `${WEBHOOK_LOG} No Sartistic order for Razorpay order ${razorpayOrderId} (event ${eventId})`,
    );
    return json(200, { ok: true, ignored: "unknown order" });
  }

  const expectedPaise = Math.round(Number(order.total) * 100);
  if (payment.amount !== expectedPaise || (payment.currency ?? "").toUpperCase() !== "INR") {
    console.error(
      `${WEBHOOK_LOG} Amount mismatch for order ${order.id}: expected ${expectedPaise} INR, got ${payment.amount} ${payment.currency} (payment ${paymentId}, event ${eventId}) — needs manual review`,
    );
    return json(200, { ok: true, ignored: "amount mismatch" });
  }

  const result = await markOrderPaid({
    orderId: order.id,
    razorpayOrderId,
    razorpayPaymentId: paymentId,
  });
  if (result.outcome === "not_payable") {
    console.error(
      `${WEBHOOK_LOG} Captured payment ${paymentId} for order ${order.id} but order is payment_status=${result.paymentStatus} status=${result.status} — needs manual review (event ${eventId})`,
    );
  } else {
    console.info(
      `${WEBHOOK_LOG} ${type}: order ${order.id} ${result.outcome} (payment ${paymentId}, event ${eventId})`,
    );
  }
  return json(200, { ok: true, outcome: result.outcome });
}

async function handleFailed(
  eventId: string,
  payment: RazorpayPaymentEntity | undefined,
): Promise<Response> {
  const razorpayOrderId = payment?.order_id ?? null;
  if (!razorpayOrderId) return json(200, { ok: true, ignored: "no order id" });

  const order = await findOrderForRazorpayOrder(razorpayOrderId, null);
  if (!order) return json(200, { ok: true, ignored: "unknown order" });

  const changed = await markOrderPaymentFailed({ orderId: order.id, razorpayOrderId });
  console.info(
    `${WEBHOOK_LOG} payment.failed: order ${order.id} ${changed ? "marked failed" : "unchanged"} (payment ${payment?.id}, event ${eventId})`,
  );
  return json(200, { ok: true, outcome: changed ? "marked_failed" : "unchanged" });
}
