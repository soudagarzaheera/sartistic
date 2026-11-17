/**
 * Server-only: Razorpay refunds for approved refund requests.
 * Load with `await import("@/lib/refunds.server")` inside server handlers.
 *
 * A request only becomes "refunded" when Razorpay itself reports the refund
 * as processed (in the create response, a status check, or a signed
 * refund.processed webhook). Every transition is a conditional update, so
 * double clicks, retries and duplicate webhooks never issue or record a
 * refund twice:
 *
 *   approved ──claim──▶ processing ──Razorpay "processed"──▶ refunded
 *                           │
 *                           └── Razorpay rejected / no refund exists ──▶ approved (retry)
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LOG = "[refunds]";

type RazorpayRefund = {
  id: string;
  amount: number;
  currency?: string;
  payment_id: string;
  status: "pending" | "processed" | "failed" | string;
  notes?: Record<string, unknown> | unknown[];
};

class RazorpayError extends Error {
  constructor(
    message: string,
    /** True when Razorpay definitely did not create a refund (4xx). */
    readonly rejected: boolean,
  ) {
    super(message);
  }
}

function credentials() {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured on the server.");
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function razorpay<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: credentials() },
    });
  } catch (err) {
    throw new RazorpayError(
      `Couldn't reach Razorpay: ${err instanceof Error ? err.message : err}`,
      false,
    );
  }
  const text = await response.text();
  if (!response.ok) {
    let description = text;
    try {
      description =
        (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? text;
    } catch {
      /* keep raw text */
    }
    throw new RazorpayError(
      `Razorpay ${response.status}: ${description}`,
      response.status >= 400 && response.status < 500,
    );
  }
  return JSON.parse(text) as T;
}

function noteRequestId(notes: RazorpayRefund["notes"]) {
  if (!notes || Array.isArray(notes)) return null;
  const v = notes["refund_request_id"];
  return typeof v === "string" ? v : null;
}

/** Applies a Razorpay refund entity to its request. Idempotent. */
async function applyGatewayRefund(requestId: string, refund: RazorpayRefund) {
  if (refund.status === "processed") {
    const { data, error } = await supabaseAdmin
      .from("refund_requests")
      .update({
        status: "refunded",
        gateway_refund_id: refund.id,
        gateway_status: refund.status,
        refunded_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq("id", requestId)
      .in("status", ["approved", "processing"])
      .select("order_id");
    if (error) throw new Error(`${LOG} Couldn't mark ${requestId} refunded: ${error.message}`);
    if (data?.[0]) await markOrderRefundedIfComplete(data[0].order_id);
    return "refunded" as const;
  }

  if (refund.status === "failed") {
    const { error } = await supabaseAdmin
      .from("refund_requests")
      .update({
        status: "approved",
        gateway_status: "failed",
        failure_reason: "Razorpay reported this refund as failed. You can try again.",
      })
      .eq("id", requestId)
      .eq("status", "processing")
      // Ignore a late failure event for an earlier attempt once a newer refund exists.
      .or(`gateway_refund_id.is.null,gateway_refund_id.eq.${refund.id}`);
    if (error) throw new Error(`${LOG} Couldn't record failure for ${requestId}: ${error.message}`);
    return "failed" as const;
  }

  const { error } = await supabaseAdmin
    .from("refund_requests")
    .update({ status: "processing", gateway_refund_id: refund.id, gateway_status: refund.status })
    .eq("id", requestId)
    .in("status", ["approved", "processing"]);
  if (error) throw new Error(`${LOG} Couldn't save refund ${refund.id}: ${error.message}`);
  return "processing" as const;
}

/**
 * When everything paid for the order has been refunded, the order's payment
 * status becomes "refunded" (partial refunds leave it "paid").
 */
export async function markOrderRefundedIfComplete(orderId: string) {
  const [{ data: order }, { data: refunds }] = await Promise.all([
    supabaseAdmin.from("orders").select("total, payment_status").eq("id", orderId).maybeSingle(),
    supabaseAdmin
      .from("refund_requests")
      .select("approved_amount")
      .eq("order_id", orderId)
      .eq("status", "refunded"),
  ]);
  if (!order || order.payment_status !== "paid") return;
  const refunded = (refunds ?? []).reduce((s, r) => s + Number(r.approved_amount ?? 0), 0);
  if (refunded + 0.005 < Number(order.total)) return;
  await supabaseAdmin
    .from("orders")
    .update({ payment_status: "refunded" })
    .eq("id", orderId)
    .eq("payment_status", "paid");
}

export type IssueResult = { outcome: "refunded" | "processing" | "failed"; message: string };

/** Issues the Razorpay refund for an approved request. */
export async function issueRazorpayRefund(requestId: string): Promise<IssueResult> {
  const { data: req, error } = await supabaseAdmin
    .from("refund_requests")
    .select(
      "id, status, payment_method, razorpay_payment_id, approved_amount, order_id, orders(order_number, payment_status, razorpay_payment_id)",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error("Couldn't load the refund request.");
  if (!req) throw new Error("Refund request not found.");
  if (req.payment_method !== "razorpay")
    throw new Error("This order wasn't paid online; record the refund manually.");
  if (req.status !== "approved")
    throw new Error(`Only approved requests can be refunded (this one is ${req.status}).`);
  if (!req.approved_amount || Number(req.approved_amount) <= 0)
    throw new Error("Set an approved amount first.");
  const paymentId = req.razorpay_payment_id;
  if (!paymentId || paymentId !== req.orders?.razorpay_payment_id) {
    throw new Error("This request isn't linked to the order's Razorpay payment.");
  }
  if (req.orders?.payment_status !== "paid") {
    throw new Error(`The order's payment is ${req.orders?.payment_status ?? "unknown"}, not paid.`);
  }

  // Claim the request so a second click / tab can't issue a second refund.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("refund_requests")
    .update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      gateway_status: "requested",
      failure_reason: null,
    })
    .eq("id", requestId)
    .eq("status", "approved")
    .select("id");
  if (claimError) throw new Error("Couldn't start the refund.");
  if (!claimed?.length) throw new Error("This refund is already being processed.");

  let refund: RazorpayRefund;
  try {
    refund = await razorpay<RazorpayRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      body: JSON.stringify({
        amount: Math.round(Number(req.approved_amount) * 100),
        speed: "normal",
        receipt: req.id.slice(0, 40),
        notes: { refund_request_id: req.id, order_number: req.orders?.order_number ?? "" },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} Refund for ${requestId} failed: ${message}`);
    if (err instanceof RazorpayError && err.rejected) {
      // Razorpay refused it outright: nothing was refunded, so allow a retry.
      await supabaseAdmin
        .from("refund_requests")
        .update({ status: "approved", gateway_status: "rejected", failure_reason: message })
        .eq("id", requestId)
        .eq("status", "processing")
        .is("gateway_refund_id", null);
      return { outcome: "failed", message };
    }
    // Unknown outcome (timeout / 5xx): stay "processing" until a status check settles it.
    await supabaseAdmin
      .from("refund_requests")
      .update({ gateway_status: "unknown", failure_reason: message })
      .eq("id", requestId);
    return {
      outcome: "processing",
      message:
        "Razorpay didn't confirm the refund. Use “Check with Razorpay” in a minute before retrying.",
    };
  }

  const outcome = await applyGatewayRefund(requestId, refund);
  return {
    outcome,
    message:
      outcome === "refunded"
        ? `Refund ${refund.id} processed by Razorpay.`
        : outcome === "failed"
          ? "Razorpay reported the refund as failed."
          : `Refund ${refund.id} created; Razorpay is processing it.`,
  };
}

/**
 * Re-reads the refund from Razorpay (by id, or by our request id in the
 * refund notes) and applies its real status. If Razorpay has no refund for
 * this request and the attempt is at least two minutes old, the request goes
 * back to "approved" so it can be retried safely.
 */
export async function syncRazorpayRefund(requestId: string): Promise<IssueResult> {
  const { data: req, error } = await supabaseAdmin
    .from("refund_requests")
    .select(
      "id, status, payment_method, razorpay_payment_id, gateway_refund_id, processing_started_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error || !req) throw new Error("Refund request not found.");
  if (req.payment_method !== "razorpay" || !req.razorpay_payment_id) {
    throw new Error("This request has no Razorpay payment to check.");
  }

  let refund: RazorpayRefund | null = null;
  if (req.gateway_refund_id) {
    refund = await razorpay<RazorpayRefund>(
      `/refunds/${encodeURIComponent(req.gateway_refund_id)}`,
    );
  } else {
    const list = await razorpay<{ items?: RazorpayRefund[] }>(
      `/payments/${encodeURIComponent(req.razorpay_payment_id)}/refunds?count=100`,
    );
    refund = list.items?.find((r) => noteRequestId(r.notes) === req.id) ?? null;
  }

  if (!refund) {
    const startedAt = req.processing_started_at ? new Date(req.processing_started_at).getTime() : 0;
    if (req.status === "processing" && Date.now() - startedAt > 2 * 60 * 1000) {
      await supabaseAdmin
        .from("refund_requests")
        .update({
          status: "approved",
          gateway_status: "not_found",
          failure_reason: "Razorpay has no refund for this request. It's safe to try again.",
        })
        .eq("id", requestId)
        .eq("status", "processing")
        .is("gateway_refund_id", null);
      return { outcome: "failed", message: "No refund found at Razorpay — you can retry it." };
    }
    return {
      outcome: "processing",
      message: "No refund found at Razorpay yet. Check again shortly.",
    };
  }

  const outcome = await applyGatewayRefund(requestId, refund);
  return { outcome, message: `Razorpay status: ${refund.status}` };
}

/**
 * Razorpay refund.* webhook events (signature already verified by the
 * caller). Matches the request by refund id or by our request id in notes.
 */
export async function handleRefundWebhook(refund: RazorpayRefund | undefined) {
  if (!refund?.id) return "ignored";
  let requestId = noteRequestId(refund.notes);
  if (!requestId) {
    const { data } = await supabaseAdmin
      .from("refund_requests")
      .select("id")
      .eq("gateway_refund_id", refund.id)
      .maybeSingle();
    requestId = data?.id ?? null;
  }
  if (!requestId) return "unknown refund";
  return applyGatewayRefund(requestId, refund);
}
