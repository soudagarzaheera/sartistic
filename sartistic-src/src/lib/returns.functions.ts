import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { requireAdmin } from "@/lib/admin.functions";
import {
  EVIDENCE_BUCKET,
  itemRefundAmount,
  MAX_EVIDENCE_IMAGES,
  REFUND_REASONS,
  REFUND_STATUSES,
  refundProblem,
  refundTransitions,
  requestWindow,
  RETURN_REASONS,
  RETURN_STATUSES,
  RETURN_TRANSITIONS,
  windowProblem,
  type RefundStatus,
  type ReturnStatus,
} from "@/lib/returns";

/**
 * Return & refund requests.
 *
 * Customers have no write access to the request tables; these functions are
 * the only way in. Each one re-checks ownership, the order's delivery window
 * (on the server's clock, via the shared requestWindow) and the allowed
 * status transitions, so none of it can be bypassed by editing a request in
 * the browser. Status updates are conditional on the status the admin saw,
 * so two admins acting at once can't skip a step.
 */

/** Loaded lazily so the service-role client never reaches the browser bundle. */
async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const IMAGE_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpe?g|png|webp|avif|gif)$/i;

const requestSchema = z.object({
  orderId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  details: z.string().trim().max(1000).optional().default(""),
  imagePaths: z.array(z.string().max(200)).max(MAX_EVIDENCE_IMAGES).default([]),
});

function checkImagePaths(paths: string[], userId: string) {
  for (const p of paths) {
    if (!IMAGE_PATH_RE.test(p) || !p.startsWith(`${userId}/`)) {
      throw new Error("One of the photos couldn't be attached. Please upload it again.");
    }
  }
  return [...new Set(paths)];
}

async function loadOwnOrderItem(userId: string, orderId: string, orderItemId: string) {
  const admin = await getSupabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, user_id, status, delivered_at, payment_method, payment_status, razorpay_payment_id, subtotal, discount, total, order_items(id, quantity, unit_price, total_price)",
    )
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Couldn't load this order. Please try again.");
  if (!order) throw new Error("Order not found.");
  const item = order.order_items.find((i) => i.id === orderItemId);
  if (!item) throw new Error("That item isn't part of this order.");
  return { admin, order, item };
}

function duplicateMessage(error: { code?: string } | null, kind: "return" | "refund") {
  if (error?.code === "23505") return `You've already requested a ${kind} for this item.`;
  return `We couldn't submit your ${kind} request. Please try again.`;
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export const createReturnRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    requestSchema.extend({ reason: z.enum(RETURN_REASONS) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { admin, order, item } = await loadOwnOrderItem(
      context.userId,
      data.orderId,
      data.orderItemId,
    );
    const window = requestWindow(order); // server clock
    const problem = windowProblem(window);
    if (problem || window.state !== "open") throw new Error(problem ?? "Not eligible.");
    if (data.quantity > item.quantity) throw new Error("You can't return more than you ordered.");
    if (data.reason === "Other" && !data.details) {
      throw new Error("Please tell us briefly why you're returning this item.");
    }

    const { data: created, error } = await admin
      .from("return_requests")
      .insert({
        order_id: order.id,
        order_item_id: item.id,
        user_id: context.userId,
        quantity: data.quantity,
        reason: data.reason,
        details: data.details || null,
        image_paths: checkImagePaths(data.imagePaths, context.userId),
        delivered_at: window.deliveredAt.toISOString(),
        window_ends_at: window.endsAt.toISOString(),
      })
      .select("id")
      .single();
    if (error || !created) {
      if (error?.code !== "23505") console.error(`[returns] insert failed: ${error?.message}`);
      throw new Error(duplicateMessage(error, "return"));
    }
    return { id: created.id };
  });

export const createRefundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    requestSchema.extend({ reason: z.enum(REFUND_REASONS) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { admin, order, item } = await loadOwnOrderItem(
      context.userId,
      data.orderId,
      data.orderItemId,
    );
    const window = requestWindow(order); // server clock
    const problem = refundProblem(order, window);
    if (problem || window.state !== "open") throw new Error(problem ?? "Not eligible.");
    if (data.quantity > item.quantity) throw new Error("You can't request more than you ordered.");
    if (data.reason === "Other" && !data.details) {
      throw new Error("Please tell us briefly why you're requesting a refund.");
    }

    // Link to this item's return, if there is one that wasn't rejected.
    const { data: ret } = await admin
      .from("return_requests")
      .select("id, status")
      .eq("order_item_id", item.id)
      .maybeSingle();

    const { data: created, error } = await admin
      .from("refund_requests")
      .insert({
        order_id: order.id,
        order_item_id: item.id,
        user_id: context.userId,
        return_request_id: ret && ret.status !== "rejected" ? ret.id : null,
        quantity: data.quantity,
        reason: data.reason,
        details: data.details || null,
        image_paths: checkImagePaths(data.imagePaths, context.userId),
        payment_method: order.payment_method,
        razorpay_payment_id: order.payment_method === "razorpay" ? order.razorpay_payment_id : null,
        requested_amount: itemRefundAmount(item, order, data.quantity),
        delivered_at: window.deliveredAt.toISOString(),
        window_ends_at: window.endsAt.toISOString(),
      })
      .select("id")
      .single();
    if (error || !created) {
      if (error?.code !== "23505") console.error(`[refunds] insert failed: ${error?.message}`);
      throw new Error(duplicateMessage(error, "refund"));
    }
    return { id: created.id };
  });

// ---------------------------------------------------------------------------
// Admin: listing
// ---------------------------------------------------------------------------

const ORDER_COLUMNS =
  "order_number, user_id, status, payment_method, payment_status, total, subtotal, discount, shipping_fee, shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_postal_code, delivered_at, shiprocket_awb, razorpay_payment_id, created_at";
const ITEM_COLUMNS =
  "product_name, variant_name, sku, image_url, quantity, unit_price, total_price";

async function signEvidence(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const admin = await getSupabaseAdmin();
  const { data } = await admin.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 60 * 60);
  return new Map(
    (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]),
  );
}

export const listReturnRequests = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin
      .from("return_requests")
      .select(`*, orders(${ORDER_COLUMNS}), order_items(${ITEM_COLUMNS})`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error(`[returns] list failed: ${error.message}`);
      throw new Error("Couldn't load return requests.");
    }
    const urls = await signEvidence((data ?? []).flatMap((r) => r.image_paths));
    return (data ?? []).map((r) => ({
      ...r,
      images: r.image_paths.map((p) => urls.get(p)).filter((u): u is string => Boolean(u)),
    }));
  });

export const listRefundRequests = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin
      .from("refund_requests")
      .select(`*, orders(${ORDER_COLUMNS}), order_items(${ITEM_COLUMNS}), return_requests(status)`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error(`[refunds] list failed: ${error.message}`);
      throw new Error("Couldn't load refund requests.");
    }
    const urls = await signEvidence((data ?? []).flatMap((r) => r.image_paths));
    return (data ?? []).map((r) => ({
      ...r,
      images: r.image_paths.map((p) => urls.get(p)).filter((u): u is string => Boolean(u)),
    }));
  });

// ---------------------------------------------------------------------------
// Admin: actions
// ---------------------------------------------------------------------------

export const saveRequestRemarks = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        kind: z.enum(["return", "refund"]),
        id: z.string().uuid(),
        remarks: z.string().trim().max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getSupabaseAdmin();
    const table = data.kind === "return" ? "return_requests" : "refund_requests";
    const { error } = await admin
      .from(table)
      .update({ admin_remarks: data.remarks || null })
      .eq("id", data.id);
    if (error) throw new Error("Couldn't save the remarks.");
    return { ok: true };
  });

export const updateReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        from: z.enum(RETURN_STATUSES),
        to: z.enum(RETURN_STATUSES),
        customerMessage: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!RETURN_TRANSITIONS[data.from as ReturnStatus].includes(data.to as ReturnStatus)) {
      throw new Error(`A return can't move from ${data.from} to ${data.to}.`);
    }
    if (data.to === "rejected" && !data.customerMessage) {
      throw new Error("Add a short reason for the customer when rejecting.");
    }
    const now = new Date().toISOString();
    const admin = await getSupabaseAdmin();
    const { data: updated, error } = await admin
      .from("return_requests")
      .update({
        status: data.to,
        ...(data.customerMessage !== undefined
          ? { customer_message: data.customerMessage || null }
          : {}),
        ...(data.to === "approved" || data.to === "rejected"
          ? { reviewed_by: context.userId, reviewed_at: now }
          : {}),
        ...(data.to === "picked_up" ? { picked_up_at: now } : {}),
        ...(data.to === "returned" ? { returned_at: now } : {}),
      })
      .eq("id", data.id)
      .eq("status", data.from)
      .select("id");
    if (error) throw new Error("Couldn't update the return.");
    if (!updated?.length)
      throw new Error("This return was changed by someone else. Refresh and try again.");
    return { ok: true };
  });

export const updateRefundStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        from: z.enum(REFUND_STATUSES),
        to: z.enum(REFUND_STATUSES),
        approvedAmount: z.number().positive().max(10_000_000).optional(),
        reference: z.string().trim().max(120).optional(),
        customerMessage: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await getSupabaseAdmin();
    const { data: req, error } = await admin
      .from("refund_requests")
      .select(
        "id, status, order_id, payment_method, requested_amount, approved_amount, orders(total, payment_status)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !req) throw new Error("Refund request not found.");
    if (req.status !== data.from) {
      throw new Error("This refund was changed by someone else. Refresh and try again.");
    }
    const allowed = refundTransitions(req.status as RefundStatus, req.payment_method);
    if (!allowed.includes(data.to as RefundStatus)) {
      throw new Error(
        req.payment_method === "razorpay" && ["processing", "refunded"].includes(data.to)
          ? "Online refunds are issued through Razorpay with “Issue refund”, not set by hand."
          : `A refund can't move from ${data.from} to ${data.to}.`,
      );
    }

    const now = new Date().toISOString();
    const patch: TablesUpdate<"refund_requests"> = { status: data.to };
    if (data.customerMessage !== undefined) patch.customer_message = data.customerMessage || null;

    if (data.to === "approved") {
      const amount = Math.round((data.approvedAmount ?? Number(req.requested_amount)) * 100) / 100;
      if (!(amount > 0)) throw new Error("Enter the amount to refund.");
      // Never approve more than was paid, across all of the order's refunds.
      const { data: others } = await admin
        .from("refund_requests")
        .select("approved_amount")
        .eq("order_id", req.order_id)
        .neq("id", req.id)
        .neq("status", "rejected");
      const committed = (others ?? []).reduce((s, r) => s + Number(r.approved_amount ?? 0), 0);
      const limit = Number(req.orders?.total ?? 0) - committed;
      if (amount > limit + 0.005) {
        throw new Error(`That's more than the remaining refundable amount (₹${limit.toFixed(2)}).`);
      }
      Object.assign(patch, {
        approved_amount: amount,
        reviewed_by: context.userId,
        reviewed_at: now,
      });
    }
    if (data.to === "rejected") {
      if (!data.customerMessage)
        throw new Error("Add a short reason for the customer when rejecting.");
      Object.assign(patch, { reviewed_by: context.userId, reviewed_at: now });
    }
    if (data.to === "processing") patch.processing_started_at = now;
    if (data.to === "refunded") {
      // Manual (Cash on Delivery) refunds must record the bank/UPI transaction.
      if (!data.reference || data.reference.length < 4) {
        throw new Error("Enter the bank or UPI transaction reference for this refund.");
      }
      Object.assign(patch, { refund_reference: data.reference, refunded_at: now });
    }

    const { data: updated, error: updateError } = await admin
      .from("refund_requests")
      .update(patch)
      .eq("id", data.id)
      .eq("status", data.from)
      .select("id");
    if (updateError) {
      console.error(`[refunds] status update failed: ${updateError.message}`);
      throw new Error("Couldn't update the refund.");
    }
    if (!updated?.length)
      throw new Error("This refund was changed by someone else. Refresh and try again.");

    if (data.to === "refunded") {
      const { markOrderRefundedIfComplete } = await import("@/lib/refunds.server");
      await markOrderRefundedIfComplete(req.order_id);
    }
    return { ok: true };
  });

export const issueRefund = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { issueRazorpayRefund } = await import("@/lib/refunds.server");
    return issueRazorpayRefund(data.id);
  });

export const checkRefundWithGateway = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { syncRazorpayRefund } = await import("@/lib/refunds.server");
    try {
      return await syncRazorpayRefund(data.id);
    } catch (err) {
      console.error(`[refunds] sync failed for ${data.id}:`, err);
      throw new Error(err instanceof Error ? err.message : "Couldn't check with Razorpay.");
    }
  });
