import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const lineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  quantity: z.number().int().min(1).max(20),
});

const shippingSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(6).max(20),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postal_code: z.string().trim().min(4).max(12),
  country: z.string().trim().max(60).default("India"),
});

const createOrderSchema = z.object({
  items: z.array(lineSchema).min(1).max(30),
  shipping: shippingSchema,
  couponCode: z.string().trim().max(40).nullable().optional(),
});

const SHIPPING_FEE = 79;
const FREE_SHIPPING_ABOVE = 999;

/**
 * Loads the service-role Supabase client. Only ever call this from inside a
 * server function handler: the dynamic import keeps client.server.ts (and the
 * service-role key it reads) out of the browser bundle.
 *
 * Customers have no UPDATE policy on `orders` by design, so payment-state
 * changes go through this client — always after the order's ownership has
 * been checked against the authenticated user, and always scoped by user_id.
 */
async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function orderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SAR-${stamp}-${rand}`;
}

/**
 * Creates the order server-side. Prices, discounts and totals are always
 * recomputed from the database — browser-supplied amounts are never trusted.
 */
export const createCheckoutOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const { data: products, error: productError } = await supabase
      .from("products")
      .select(
        "id, name, price, sku, stock_quantity, is_active, product_images(image_url, is_primary, sort_order), product_variants(id, name, price, stock_quantity, is_active, sku)",
      )
      .in("id", productIds);
    if (productError) throw new Error("We couldn't load your items. Please try again.");

    let subtotal = 0;
    const orderItems: {
      product_id: string;
      variant_id: string | null;
      product_name: string;
      variant_name: string | null;
      sku: string | null;
      image_url: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
    }[] = [];

    for (const line of data.items) {
      const product = products?.find((p) => p.id === line.productId);
      if (!product || !product.is_active) {
        throw new Error("One of the items is no longer available.");
      }
      const variant = line.variantId
        ? product.product_variants?.find((v) => v.id === line.variantId && v.is_active)
        : null;
      if (line.variantId && !variant) {
        throw new Error(`The selected option for ${product.name} is unavailable.`);
      }
      const stock = variant?.stock_quantity ?? product.stock_quantity;
      if (stock < line.quantity) {
        throw new Error(`${product.name} only has ${stock} left in stock.`);
      }
      const unitPrice = Number(variant?.price ?? product.price);
      const total = unitPrice * line.quantity;
      subtotal += total;
      const image =
        [...(product.product_images ?? [])].sort(
          (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
        )[0]?.image_url ?? null;

      orderItems.push({
        product_id: product.id,
        variant_id: variant?.id ?? null,
        product_name: product.name,
        variant_name: variant?.name ?? null,
        sku: variant?.sku ?? product.sku,
        image_url: image,
        quantity: line.quantity,
        unit_price: unitPrice,
        total_price: total,
      });
    }

    // Coupon validation happens server-side against the coupons table.
    let discount = 0;
    let appliedCoupon: string | null = null;
    if (data.couponCode) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", data.couponCode.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      const now = Date.now();
      const valid =
        coupon &&
        subtotal >= Number(coupon.minimum_order_value) &&
        (!coupon.starts_at || new Date(coupon.starts_at).getTime() <= now) &&
        (!coupon.expires_at || new Date(coupon.expires_at).getTime() >= now) &&
        (!coupon.usage_limit || coupon.used_count < coupon.usage_limit);
      if (!valid) throw new Error("That coupon code isn't valid for this order.");
      discount =
        coupon!.discount_type === "percentage"
          ? (subtotal * Number(coupon!.discount_value)) / 100
          : Number(coupon!.discount_value);
      if (coupon!.maximum_discount) discount = Math.min(discount, Number(coupon!.maximum_discount));
      discount = Math.min(Math.round(discount), subtotal);
      appliedCoupon = coupon!.code;
    }

    const shippingFee = subtotal - discount >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const total = subtotal - discount + shippingFee;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        order_number: orderNumber(),
        subtotal,
        discount,
        shipping_fee: shippingFee,
        total,
        status: "pending",
        payment_status: "pending",
        coupon_code: appliedCoupon,
        shipping_name: data.shipping.full_name,
        shipping_phone: data.shipping.phone,
        shipping_email: data.shipping.email,
        shipping_address: data.shipping.address,
        shipping_city: data.shipping.city,
        shipping_state: data.shipping.state,
        shipping_postal_code: data.shipping.postal_code,
        shipping_country: data.shipping.country || "India",
      })
      .select("id, order_number, total")
      .single();
    if (orderError || !order) throw new Error("We couldn't start your order. Please try again.");

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems.map((item) => ({ ...item, order_id: order.id })));
    if (itemsError) throw new Error("We couldn't save your order items. Please try again.");

    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) {
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        amount: total,
        subtotal,
        discount,
        shippingFee,
        razorpay: null as null | { orderId: string; keyId: string },
        paymentUnavailable: true,
      };
    }

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      },
      body: JSON.stringify({
        amount: Math.round(total * 100),
        currency: "INR",
        receipt: order.order_number,
        notes: { order_id: order.id },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Razorpay order creation failed [${response.status}]: ${body}`);
      throw new Error("Payment could not be started. Please try again in a moment.");
    }

    const razorpayOrder = (await response.json()) as { id: string };

    // The order was inserted above by this user's RLS-scoped client, so it is
    // theirs; the user_id filter re-asserts that for the privileged write.
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: linked, error: linkError } = await supabaseAdmin
      .from("orders")
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq("id", order.id)
      .eq("user_id", userId)
      .eq("payment_status", "pending")
      .select("id");
    if (linkError || !linked || linked.length !== 1) {
      console.error(
        `[checkout] Failed to save razorpay_order_id for order ${order.id}: ${
          linkError?.message ?? `${linked?.length ?? 0} rows updated`
        }`,
      );
      throw new Error("Payment could not be started. Please try again in a moment.");
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: total,
      subtotal,
      discount,
      shippingFee,
      razorpay: { orderId: razorpayOrder.id, keyId },
      paymentUnavailable: false,
    };
  });

const verifySchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().min(1).max(200),
});

/** Verifies the Razorpay signature before marking an order paid. */
export const verifyCheckoutPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keySecret) throw new Error("Payments are not configured yet.");

    // Ownership check: read through the user's RLS-scoped client AND compare
    // user_id explicitly, before any privileged write happens.
    const { data: order, error: readError } = await supabase
      .from("orders")
      .select("id, user_id, payment_status, razorpay_order_id, order_number")
      .eq("id", data.orderId)
      .maybeSingle();
    if (readError) {
      console.error(`[checkout] Failed to load order ${data.orderId}: ${readError.message}`);
      throw new Error(
        "We couldn't confirm your payment. Please contact us with your order number.",
      );
    }
    if (!order || order.user_id !== userId) throw new Error("Order not found.");
    if (order.payment_status === "paid") {
      // Idempotent: never process the same payment twice.
      return { ok: true, orderNumber: order.order_number };
    }
    if (!order.razorpay_order_id || order.razorpay_order_id !== data.razorpayOrderId) {
      console.error(
        `[checkout] Razorpay order mismatch for order ${order.id}: stored=${
          order.razorpay_order_id ?? "null"
        } received=${data.razorpayOrderId}`,
      );
      throw new Error("Payment reference mismatch.");
    }

    // Loaded lazily: server-only module (service-role client).
    const { hmacSha256Hex, timingSafeEqualHex, markOrderPaid } =
      await import("@/lib/payments.server");

    const expected = await hmacSha256Hex(
      keySecret,
      `${data.razorpayOrderId}|${data.razorpayPaymentId}`,
    );
    if (!timingSafeEqualHex(expected, data.razorpaySignature)) {
      // Left as "pending" on purpose: a misconfigured secret would otherwise
      // permanently mark genuinely captured payments as failed.
      console.error(
        `[checkout] Signature verification failed for order ${order.id} (payment ${data.razorpayPaymentId})`,
      );
      throw new Error("We couldn't verify this payment. You have not been charged twice.");
    }

    // Shared with the webhook. Conditional on payment_status pending/failed
    // (never paid/refunded) and scoped to this customer, so duplicate or
    // concurrent verification requests can't double-process the order.
    let result: Awaited<ReturnType<typeof markOrderPaid>>;
    try {
      result = await markOrderPaid({
        orderId: order.id,
        razorpayOrderId: data.razorpayOrderId,
        razorpayPaymentId: data.razorpayPaymentId,
        userId,
      });
    } catch (error) {
      console.error(`[checkout] ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(
        "We couldn't confirm your payment. Please contact us with your order number.",
      );
    }

    if (result.outcome === "not_payable") {
      console.error(
        `[checkout] Verified payment ${data.razorpayPaymentId} but order ${order.id} is payment_status=${result.paymentStatus} status=${result.status} — needs manual review`,
      );
      throw new Error(
        "We couldn't confirm your payment. Please contact us with your order number.",
      );
    }

    return { ok: true, orderNumber: order.order_number };
  });

// Note: there is intentionally no "mark failed on dismiss" function. Closing
// the Checkout window doesn't prove a payment failed (UPI and some bank flows
// complete afterwards); the Razorpay webhook records failures instead.
