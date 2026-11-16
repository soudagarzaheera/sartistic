import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Allow only authenticated administrators.
const requireShippingAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (error || data !== true) {
      throw new Error("Forbidden: admin access required");
    }

    return next();
  });

// Temporary function to test Shiprocket authentication.
export const testShiprocketConnection = createServerFn({
  method: "POST",
})
  .middleware([requireShippingAdmin])
  .handler(async () => {
    try {
      const { getShiprocketToken } = await import(
        "@/lib/shiprocket.server"
      );

      await getShiprocketToken();

      // Never send the actual Shiprocket token to the browser.
      return {
        success: true,
        message: "Shiprocket authentication successful.",
      };
    } catch (error) {
      console.error("[shiprocket] Authentication test failed:", error);

      throw new Error(
        "Shiprocket authentication failed. Check your server configuration."
      );
    }
  });




export const getShiprocketPickupLocations = createServerFn({
  method: "GET",
})
  .middleware([requireShippingAdmin])
  .handler(async () => {
    try {
      const { shiprocketRequest } = await import(
        "@/lib/shiprocket.server"
      );

      const result = await shiprocketRequest<{
        data?: {
          shipping_address?: Array<Record<string, unknown>>;
        };
      }>("/settings/company/pickup");

      const locations = result.data?.shipping_address ?? [];

      return {
        success: true,
        locations: locations.map((location) => ({
          id: String(location["id"] ?? ""),
          pickupLocation: String(location["pickup_location"] ?? ""),
          pinCode: String(location["pin_code"] ?? ""),
          city: String(location["city"] ?? ""),
          state: String(location["state"] ?? ""),
          status: String(location["status"] ?? ""),
          isPrimary: location["is_primary_location"] === true,
        })),
      };
    } catch (error) {
      console.error("[shiprocket] Pickup locations failed:", error);
      throw new Error("Could not retrieve Shiprocket pickup locations.");
    }
  });

const createShipmentSchema = z.object({
  orderId: z.string().uuid(),
  weightKg: z.number().min(0.01).max(50),
  lengthCm: z.number().min(0.5).max(200),
  breadthCm: z.number().min(0.5).max(200),
  heightCm: z.number().min(0.5).max(200),
});

// A claim older than this is treated as abandoned (e.g. the server crashed
// mid-request) and may be retried.
const SHIPMENT_CLAIM_MS = 10 * 60 * 1000;

/**
 * Sends one order to Shiprocket. COD orders go as "COD" with the order total
 * as the collectable amount; prepaid orders go as "Prepaid" and must be paid.
 *
 * Duplicate protection: an order that already has a Shiprocket order id is
 * never sent again, and a conditional "claim" update stops two concurrent
 * requests (double click, two admins) from both creating a shipment.
 */
export const createShiprocketShipment = createServerFn({ method: "POST" })
  .middleware([requireShippingAdmin])
  .inputValidator((data: unknown) => createShipmentSchema.parse(data))
  .handler(async ({ data }) => {
    const pickupLocation = process.env["SHIPROCKET_PICKUP_LOCATION"];
    if (!pickupLocation) {
      throw new Error("Shiprocket isn't configured: set SHIPROCKET_PICKUP_LOCATION on the server.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shiprocketRequest, buildShipmentPayload, ShiprocketApiError } = await import(
      "@/lib/shiprocket.server"
    );

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, created_at, status, payment_method, payment_status, subtotal, discount, shipping_fee, total, shipping_name, shipping_phone, shipping_email, shipping_address, shipping_city, shipping_state, shipping_postal_code, shipping_country, shiprocket_order_id, shiprocket_shipment_id, shiprocket_awb, order_items(product_name, variant_name, sku, quantity, unit_price)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load the order.");
    if (!order) throw new Error("Order not found.");

    if (order.shiprocket_order_id) {
      return {
        created: false,
        shiprocketOrderId: order.shiprocket_order_id,
        shipmentId: order.shiprocket_shipment_id,
        awb: order.shiprocket_awb,
      };
    }
    if (["pending", "cancelled", "refunded"].includes(order.status)) {
      throw new Error(`A ${order.status} order can't be shipped.`);
    }
    if (order.payment_method === "cod") {
      if (["failed", "refunded"].includes(order.payment_status)) {
        throw new Error(`This COD order's payment is ${order.payment_status}.`);
      }
    } else if (order.payment_status !== "paid") {
      throw new Error("Prepaid orders can only be shipped once payment is confirmed.");
    }
    if (!order.order_items?.length) throw new Error("This order has no items.");

    // Validate before claiming, so a bad phone number doesn't hold the claim.
    const payload = buildShipmentPayload(order, pickupLocation, data);

    const staleBefore = new Date(Date.now() - SHIPMENT_CLAIM_MS).toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("orders")
      .update({ shipment_requested_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("shiprocket_order_id", null)
      .or(`shipment_requested_at.is.null,shipment_requested_at.lt.${staleBefore}`)
      .select("id");
    if (claimError) throw new Error("Couldn't start the shipment. Please try again.");
    if (!claimed || claimed.length !== 1) {
      throw new Error(
        "A shipment for this order is already being created. Refresh in a moment, or check Shiprocket.",
      );
    }

    async function releaseClaim() {
      await supabaseAdmin
        .from("orders")
        .update({ shipment_requested_at: null })
        .eq("id", order!.id)
        .is("shiprocket_order_id", null);
    }

    let result;
    try {
      result = await shiprocketRequest<{
        order_id?: number | string;
        shipment_id?: number | string;
        awb_code?: string | null;
        message?: string;
      }>("/orders/create/adhoc", { method: "POST", body: JSON.stringify(payload) });
    } catch (err) {
      if (err instanceof ShiprocketApiError) {
        // Shiprocket answered with an error, so nothing was created: safe to retry.
        await releaseClaim();
        console.error(`[shiprocket] Create order ${order.order_number} rejected: ${err.message}`);
        throw new Error(`Shiprocket rejected the order: ${err.detail}`);
      }
      // No answer (network/timeout): Shiprocket may or may not have created
      // it, so the claim is kept to block an immediate duplicate.
      console.error(`[shiprocket] Create order ${order.order_number} failed:`, err);
      throw new Error(
        "Couldn't reach Shiprocket. Check the Shiprocket dashboard for this order number before retrying (retry is possible after 10 minutes).",
      );
    }

    if (!result?.order_id || !result.shipment_id) {
      await releaseClaim();
      console.error(
        `[shiprocket] Unexpected create response for ${order.order_number}: ${JSON.stringify(result)}`,
      );
      throw new Error(result?.message || "Shiprocket didn't return a shipment. Please try again.");
    }

    const awb = result.awb_code ? String(result.awb_code) : null;
    const { error: saveError } = await supabaseAdmin
      .from("orders")
      .update({
        shiprocket_order_id: String(result.order_id),
        shiprocket_shipment_id: String(result.shipment_id),
        shiprocket_awb: awb,
        shipment_created_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    if (saveError) {
      console.error(
        `[shiprocket] Created SR order ${result.order_id} for ${order.order_number} but failed to save it: ${saveError.message}`,
      );
      throw new Error(
        `Shipment created in Shiprocket (order ${result.order_id}) but couldn't be saved here. Don't retry; contact support.`,
      );
    }

    return {
      created: true,
      shiprocketOrderId: String(result.order_id),
      shipmentId: String(result.shipment_id),
      awb,
    };
  });
