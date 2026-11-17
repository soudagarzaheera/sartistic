/**
 * Return & refund rules shared by the browser (display) and the server
 * (enforcement). The server functions call the same `requestWindow` with the
 * server's own clock, so a customer can't extend the deadline by changing
 * their device time or editing a request.
 *
 * The window: requests are accepted from the moment Shiprocket reports the
 * shipment delivered until 11:59:59 PM IST on the 3rd calendar day after the
 * delivery date. E.g. delivered 16 Nov at 2 PM IST → requests close at the
 * end of 19 Nov (IST). Calendar days are always counted in IST (Asia/Kolkata,
 * UTC+5:30, no daylight saving), whatever the viewer's time zone.
 */

export const REQUEST_WINDOW_DAYS = 3;
export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export const WINDOW_EXPIRED_MESSAGE =
  "Sorry, the 3-day return and refund request window has expired.";

export type WindowOrder = {
  status: string;
  delivered_at: string | null;
};

export type RequestWindow =
  | { state: "open"; deliveredAt: Date; endsAt: Date; remainingMs: number }
  | { state: "expired"; deliveredAt: Date; endsAt: Date }
  /** Not delivered yet (or delivery not confirmed by Shiprocket). */
  | { state: "not_delivered" }
  /** Marked delivered, but there is no Shiprocket delivery date to count from. */
  | { state: "no_delivery_date" }
  /** Cancelled / refunded orders. */
  | { state: "closed" };

/** The instant the window closes (exclusive): start of day delivery+N+1, IST. */
export function windowEndsAt(deliveredAt: Date): Date {
  const ist = new Date(deliveredAt.getTime() + IST_OFFSET_MS);
  const istMidnightAfterLastDay = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + REQUEST_WINDOW_DAYS + 1,
  );
  return new Date(istMidnightAfterLastDay - IST_OFFSET_MS);
}

/** Single eligibility calculation used for both returns and refunds. */
export function requestWindow(order: WindowOrder, now: Date = new Date()): RequestWindow {
  if (order.status === "cancelled" || order.status === "refunded") return { state: "closed" };
  if (order.status !== "delivered") return { state: "not_delivered" };
  if (!order.delivered_at) return { state: "no_delivery_date" };

  const deliveredAt = new Date(order.delivered_at);
  if (Number.isNaN(deliveredAt.getTime())) return { state: "no_delivery_date" };

  const endsAt = windowEndsAt(deliveredAt);
  const remainingMs = endsAt.getTime() - now.getTime();
  return remainingMs > 0
    ? { state: "open", deliveredAt, endsAt, remainingMs }
    : { state: "expired", deliveredAt, endsAt };
}

/** Why a request can't be made, in customer-facing words (null when it can). */
export function windowProblem(w: RequestWindow): string | null {
  switch (w.state) {
    case "open":
      return null;
    case "expired":
      return WINDOW_EXPIRED_MESSAGE;
    case "not_delivered":
      return "Returns and refunds can be requested once your order has been delivered.";
    case "no_delivery_date":
      return "We don't have a confirmed delivery date for this order yet, so a return or refund can't be requested online. Please contact us and we'll help.";
    case "closed":
      return "This order is closed, so returns and refunds can't be requested.";
  }
}

export type RefundableOrder = WindowOrder & {
  payment_method: string;
  payment_status: string;
  razorpay_payment_id: string | null;
};

/** Refunds additionally need a payment that was actually received. */
export function refundProblem(order: RefundableOrder, w: RequestWindow): string | null {
  const windowIssue = windowProblem(w);
  if (windowIssue) return windowIssue;
  if (order.payment_status === "refunded") return "This order has already been refunded.";
  if (order.payment_status !== "paid") {
    return order.payment_method === "cod"
      ? "A refund can be requested once your Cash on Delivery payment has been recorded."
      : "We haven't received a payment for this order, so there is nothing to refund.";
  }
  if (order.payment_method === "razorpay" && !order.razorpay_payment_id) {
    return "We couldn't find the payment for this order. Please contact us and we'll help.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const RETURN_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked_up",
  "returned",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Return Requested",
  approved: "Approved",
  rejected: "Rejected",
  picked_up: "Return Picked Up",
  returned: "Returned",
};

/** Status changes an admin may make. Nothing is ever approved automatically. */
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["picked_up", "rejected"],
  picked_up: ["returned"],
  rejected: [],
  returned: [],
};

export const REFUND_STATUSES = [
  "requested",
  "under_review",
  "approved",
  "processing",
  "refunded",
  "rejected",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: "Refund Requested",
  under_review: "Under Review",
  approved: "Approved",
  processing: "Processing",
  refunded: "Refunded",
  rejected: "Rejected",
};

/**
 * Status changes an admin may make by hand. "processing" and "refunded" for
 * online payments are set only by the Razorpay refund flow (API response,
 * status check or webhook) — never by hand, so "Refunded" is always real.
 */
export function refundTransitions(status: RefundStatus, paymentMethod: string): RefundStatus[] {
  switch (status) {
    case "requested":
      return ["under_review", "approved", "rejected"];
    case "under_review":
      return ["approved", "rejected"];
    case "approved":
      return paymentMethod === "cod" ? ["processing", "rejected"] : ["rejected"];
    case "processing":
      return paymentMethod === "cod" ? ["refunded"] : [];
    default:
      return [];
  }
}

export const RETURN_REASONS = [
  "Damaged or leaking product",
  "Wrong item received",
  "Item missing from package",
  "Product expired or quality issue",
  "Other",
] as const;

export const REFUND_REASONS = [
  "Damaged or leaking product",
  "Wrong item received",
  "Item missing from package",
  "Product expired or quality issue",
  "Returned item",
  "Other",
] as const;

export const MAX_EVIDENCE_IMAGES = 5;
export const EVIDENCE_BUCKET = "return-evidence";

// ---------------------------------------------------------------------------
// Amounts & formatting
// ---------------------------------------------------------------------------

/**
 * Default refund for `quantity` units of an item: what the customer paid for
 * them, with any order-level discount shared out proportionally. Shipping is
 * not included (an admin can raise the amount when approving).
 */
export function itemRefundAmount(
  item: { unit_price: number; quantity: number; total_price: number },
  order: { subtotal: number; discount: number },
  quantity: number,
): number {
  const qty = Math.min(Math.max(1, quantity), item.quantity);
  const lineShare = (Number(item.total_price) * qty) / item.quantity;
  const subtotal = Number(order.subtotal);
  const factor = subtotal > 0 ? Math.max(0, subtotal - Number(order.discount)) / subtotal : 1;
  return Math.round(lineShare * factor * 100) / 100;
}

export function formatIstDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST_TIME_ZONE,
  });
}

/** "2 days 5 hours", "3 hours 10 minutes", "12 minutes". */
export function formatRemaining(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days > 0) return `${part(days, "day")}${hours ? ` ${part(hours, "hour")}` : ""}`;
  if (hours > 0) return `${part(hours, "hour")}${mins ? ` ${part(mins, "minute")}` : ""}`;
  return minutes > 0 ? part(mins, "minute") : "less than a minute";
}
