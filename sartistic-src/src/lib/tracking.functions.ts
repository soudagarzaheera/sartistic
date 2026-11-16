import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRACKING_FRESH_MS } from "@/lib/tracking";

/**
 * Refreshes an order's Shiprocket tracking, if it's stale.
 *
 * Access: the order is read through the caller's RLS-scoped client, which
 * only returns it to its owner or an admin, so nobody can trigger or read
 * tracking for someone else's order. Customers are throttled to one
 * Shiprocket call per order every 15 minutes; admins may force a refresh at
 * most once a minute. The page then re-reads the stored tracking itself.
 */
export const refreshOrderTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), force: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, user_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load this order.");
    if (!order) throw new Error("Order not found.");

    let minIntervalMs = TRACKING_FRESH_MS;
    if (data.force) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (isAdmin === true) minIntervalMs = 60 * 1000;
    }

    const { syncOrderTracking } = await import("@/lib/tracking.server");
    try {
      return await syncOrderTracking(order.id, { minIntervalMs });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return { outcome: "unavailable" as const, reason: "Tracking couldn't be updated right now." };
    }
  });
