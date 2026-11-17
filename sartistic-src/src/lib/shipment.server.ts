/**
 * Server-only: the Shiprocket steps after an order is created there —
 * courier/AWB assignment and pickup scheduling — plus the Shiprocket log.
 * Load with `await import("@/lib/shipment.server")` inside server handlers.
 *
 * Without these steps a Shiprocket order stays "NEW": no courier, no AWB, no
 * pickup, so the parcel never moves and there is nothing to track.
 *
 * Duplicate protection (retries, double clicks, two admins):
 *  1. a short-lived claim column (awb_requested_at / pickup_requested_at) lets
 *     only one request run at a time;
 *  2. before calling Shiprocket, its order record is re-read: if an AWB or a
 *     pickup already exists (assigned in the dashboard, or an earlier attempt
 *     whose response was lost) it is stored instead of requesting another.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesInsert } from "@/integrations/supabase/types";
import { shiprocketRequest, ShiprocketApiError } from "@/lib/shiprocket.server";
import {
  parseShiprocketDate,
  parseShiprocketOrder,
  type ShiprocketOrderSnapshot,
} from "@/lib/tracking";

const LOG = "[shiprocket]";
const CLAIM_MS = 2 * 60 * 1000;

/** Best-effort log entry; logging problems never break the action itself. */
export async function logShiprocket(entry: TablesInsert<"shiprocket_logs">) {
  const { error } = await supabaseAdmin.from("shiprocket_logs").insert(entry);
  if (error) console.error(`${LOG} couldn't write log: ${error.message}`);
}

export class ShipmentActionError extends Error {}

async function loadOrder(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, status, shiprocket_order_id, shiprocket_shipment_id, shiprocket_awb, shiprocket_courier, awb_assigned_at, pickup_scheduled_at, pickup_token",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new ShipmentActionError("Couldn't load the order.");
  if (!data) throw new ShipmentActionError("Order not found.");
  return data;
}

type Order = Awaited<ReturnType<typeof loadOrder>>;

async function readSnapshot(order: Order): Promise<ShiprocketOrderSnapshot | null> {
  return parseShiprocketOrder(
    await shiprocketRequest<unknown>(
      `/orders/show/${encodeURIComponent(order.shiprocket_order_id!)}`,
      { method: "GET" },
    ),
  );
}

function describe(err: unknown) {
  if (err instanceof ShipmentActionError) return err.message;
  if (err instanceof ShiprocketApiError) return `Shiprocket: ${err.detail}`;
  return "Couldn't reach Shiprocket. It may be temporarily unavailable — try again shortly.";
}

/** Takes the claim, or explains why another request already holds it. */
async function claim(order: Order, column: "awb_requested_at" | "pickup_requested_at") {
  const staleBefore = new Date(Date.now() - CLAIM_MS).toISOString();
  let query = supabaseAdmin
    .from("orders")
    .update(
      column === "awb_requested_at"
        ? { awb_requested_at: new Date().toISOString() }
        : { pickup_requested_at: new Date().toISOString() },
    )
    .eq("id", order.id)
    .or(`${column}.is.null,${column}.lt.${staleBefore}`);
  query =
    column === "awb_requested_at"
      ? query.is("shiprocket_awb", null)
      : query.is("pickup_scheduled_at", null);
  const { data, error } = await query.select("id");
  if (error) throw new ShipmentActionError("Couldn't start the request. Please try again.");
  if (!data?.length) {
    throw new ShipmentActionError(
      "This is already in progress (or done). Wait a moment, then use “Check tracking”.",
    );
  }
}

async function release(order: Order, column: "awb_requested_at" | "pickup_requested_at") {
  await supabaseAdmin
    .from("orders")
    .update(
      column === "awb_requested_at" ? { awb_requested_at: null } : { pickup_requested_at: null },
    )
    .eq("id", order.id);
}

function requireShipment(order: Order) {
  if (!order.shiprocket_order_id || !order.shiprocket_shipment_id) {
    throw new ShipmentActionError("Create the Shiprocket shipment first.");
  }
  if (["cancelled", "refunded"].includes(order.status)) {
    throw new ShipmentActionError(`This order is ${order.status}.`);
  }
}

const isCancelled = (s: ShiprocketOrderSnapshot | null) => /CANCEL/i.test(s?.status ?? "");

// ---------------------------------------------------------------------------
// Courier / AWB
// ---------------------------------------------------------------------------

type AssignAwbResponse = {
  awb_assign_status?: number;
  message?: string;
  response?: {
    data?: {
      awb_code?: string | number | null;
      courier_name?: string | null;
      awb_assign_error?: string;
    };
  };
};

export type AwbResult = { awb: string; courier: string | null; alreadyAssigned: boolean };

/**
 * Assigns a courier and AWB to the order's shipment. Without `courierId`,
 * Shiprocket picks the courier using the account's courier priority rules.
 */
export async function assignAwb(orderId: string, courierId?: number): Promise<AwbResult> {
  const order = await loadOrder(orderId);
  requireShipment(order);
  if (order.shiprocket_awb) {
    return { awb: order.shiprocket_awb, courier: order.shiprocket_courier, alreadyAssigned: true };
  }

  await claim(order, "awb_requested_at");
  try {
    const snapshot = await readSnapshot(order);
    if (isCancelled(snapshot)) {
      throw new ShipmentActionError("This shipment is cancelled in Shiprocket.");
    }
    if (snapshot?.awb) {
      await saveAwb(order, snapshot.awb, snapshot.courier);
      await logShiprocket({
        order_id: order.id,
        kind: "awb",
        outcome: "ok",
        message: `AWB ${snapshot.awb} was already assigned in Shiprocket; saved it.`,
      });
      return { awb: snapshot.awb, courier: snapshot.courier, alreadyAssigned: true };
    }

    const result = await shiprocketRequest<AssignAwbResponse>("/courier/assign/awb", {
      method: "POST",
      body: JSON.stringify({
        shipment_id: Number(order.shiprocket_shipment_id),
        ...(courierId ? { courier_id: courierId } : {}),
      }),
    });
    const data = result?.response?.data;
    const awb =
      data?.awb_code != null && String(data.awb_code).trim() ? String(data.awb_code).trim() : null;
    if (result?.awb_assign_status !== 1 || !awb) {
      throw new ShipmentActionError(
        `Shiprocket didn't assign an AWB: ${data?.awb_assign_error ?? result?.message ?? "no reason given"}`,
      );
    }
    const courier = data?.courier_name ?? null;
    await saveAwb(order, awb, courier);
    await logShiprocket({
      order_id: order.id,
      kind: "awb",
      outcome: "ok",
      message: `AWB ${awb} assigned${courier ? ` (${courier})` : ""}.`,
    });
    return { awb, courier, alreadyAssigned: false };
  } catch (err) {
    const message = describe(err);
    await logShiprocket({ order_id: order.id, kind: "awb", outcome: "error", message });
    // Shiprocket answered (or we refused): nothing was assigned, release now.
    // No answer at all: keep the claim; it expires in 2 minutes, and the next
    // attempt re-reads Shiprocket before assigning, so it can't double-assign.
    if (err instanceof ShiprocketApiError || err instanceof ShipmentActionError) {
      await release(order, "awb_requested_at");
    }
    console.error(`${LOG} ${order.order_number}: AWB assignment failed: ${message}`);
    throw new ShipmentActionError(message);
  }
}

async function saveAwb(order: Order, awb: string, courier: string | null) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("orders")
    .update({
      shiprocket_awb: awb,
      shiprocket_courier: courier ?? order.shiprocket_courier,
      awb_assigned_at: now,
      awb_requested_at: null,
    })
    .eq("id", order.id)
    .is("shiprocket_awb", null);
  if (error) {
    throw new ShipmentActionError(
      `AWB ${awb} was assigned in Shiprocket but couldn't be saved here. Use “Check tracking” to retry saving it.`,
    );
  }
  await setStatusIfNoScans(order, "AWB ASSIGNED");
}

/**
 * Mirrors the Shiprocket status after an action, but only until the courier's
 * own scans arrive (which then always take precedence).
 */
async function setStatusIfNoScans(order: Order, status: string) {
  await supabaseAdmin
    .from("orders")
    .update({ shiprocket_status: status })
    .eq("id", order.id)
    .is("shiprocket_status_at", null);
}

// ---------------------------------------------------------------------------
// Pickup
// ---------------------------------------------------------------------------

type PickupResponse = {
  pickup_status?: number;
  message?: string;
  response?: {
    pickup_scheduled_date?: string;
    pickup_token_number?: string | number;
    data?: string;
  };
};

export type PickupResult = {
  scheduledAt: string | null;
  token: string | null;
  alreadyScheduled: boolean;
};

/** Asks Shiprocket to schedule the courier pickup for the order's shipment. */
export async function schedulePickup(orderId: string): Promise<PickupResult> {
  const order = await loadOrder(orderId);
  requireShipment(order);
  if (!order.shiprocket_awb) throw new ShipmentActionError("Assign a courier (AWB) first.");
  if (order.pickup_scheduled_at) {
    return {
      scheduledAt: order.pickup_scheduled_at,
      token: order.pickup_token,
      alreadyScheduled: true,
    };
  }

  await claim(order, "pickup_requested_at");
  try {
    const snapshot = await readSnapshot(order);
    if (isCancelled(snapshot)) {
      throw new ShipmentActionError("This shipment is cancelled in Shiprocket.");
    }
    if (snapshot?.pickupScheduledAt) {
      const saved = await savePickup(order, snapshot.pickupScheduledAt, snapshot.pickupToken);
      await logShiprocket({
        order_id: order.id,
        kind: "pickup",
        outcome: "ok",
        message: "Pickup was already scheduled in Shiprocket; saved it.",
      });
      return { ...saved, alreadyScheduled: true };
    }

    let result: PickupResponse;
    try {
      result = await shiprocketRequest<PickupResponse>("/courier/generate/pickup", {
        method: "POST",
        body: JSON.stringify({ shipment_id: [Number(order.shiprocket_shipment_id)] }),
      });
    } catch (err) {
      // "Already in pickup queue": it is booked — record what Shiprocket has.
      if (err instanceof ShiprocketApiError && /already/i.test(err.detail)) {
        const again = await readSnapshot(order);
        const saved = await savePickup(
          order,
          again?.pickupScheduledAt ?? null,
          again?.pickupToken ?? null,
        );
        await logShiprocket({
          order_id: order.id,
          kind: "pickup",
          outcome: "ok",
          message: err.detail,
        });
        return { ...saved, alreadyScheduled: true };
      }
      throw err;
    }

    if (result?.pickup_status !== 1) {
      throw new ShipmentActionError(
        `Shiprocket didn't schedule the pickup: ${result?.response?.data ?? result?.message ?? "no reason given"}`,
      );
    }
    const token =
      result.response?.pickup_token_number != null
        ? String(result.response.pickup_token_number)
        : null;
    const saved = await savePickup(
      order,
      parseShiprocketDate(result.response?.pickup_scheduled_date),
      token,
    );
    await logShiprocket({
      order_id: order.id,
      kind: "pickup",
      outcome: "ok",
      message: result.response?.data ?? "Pickup scheduled.",
    });
    return { ...saved, alreadyScheduled: false };
  } catch (err) {
    const message = describe(err);
    await logShiprocket({ order_id: order.id, kind: "pickup", outcome: "error", message });
    if (err instanceof ShiprocketApiError || err instanceof ShipmentActionError) {
      await release(order, "pickup_requested_at");
    }
    console.error(`${LOG} ${order.order_number}: pickup scheduling failed: ${message}`);
    throw new ShipmentActionError(message);
  }
}

/**
 * Records the pickup. Shiprocket's scheduled pickup date is stored when it
 * gives one; otherwise the time Shiprocket accepted the booking.
 */
async function savePickup(order: Order, scheduledAt: Date | null, token: string | null) {
  const at = (scheduledAt ?? new Date()).toISOString();
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ pickup_scheduled_at: at, pickup_token: token, pickup_requested_at: null })
    .eq("id", order.id)
    .is("pickup_scheduled_at", null);
  if (error) throw new ShipmentActionError("Pickup was scheduled but couldn't be saved here.");
  await setStatusIfNoScans(order, "PICKUP SCHEDULED");
  return { scheduledAt: at, token };
}

// ---------------------------------------------------------------------------
// Couriers
// ---------------------------------------------------------------------------

type ServiceabilityResponse = {
  data?: {
    available_courier_companies?: Array<Record<string, unknown>>;
    recommended_courier_company_id?: number;
    shiprocket_recommended_courier_id?: number;
  };
  message?: string;
};

/** Couriers Shiprocket can use for this shipment, with its recommendation. */
export async function listCouriers(orderId: string) {
  const order = await loadOrder(orderId);
  requireShipment(order);
  let result: ServiceabilityResponse;
  try {
    result = await shiprocketRequest<ServiceabilityResponse>(
      `/courier/serviceability/?order_id=${encodeURIComponent(order.shiprocket_order_id!)}`,
      { method: "GET" },
    );
  } catch (err) {
    throw new ShipmentActionError(describe(err));
  }
  const recommended =
    result?.data?.shiprocket_recommended_courier_id ??
    result?.data?.recommended_courier_company_id ??
    null;
  const couriers = (result?.data?.available_courier_companies ?? [])
    .map((c) => ({
      id: Number(c["courier_company_id"]),
      name: String(c["courier_name"] ?? "Courier"),
      rate: Number(c["rate"] ?? c["freight_charge"] ?? 0),
      etd: typeof c["etd"] === "string" ? c["etd"] : null,
      recommended: Number(c["courier_company_id"]) === recommended,
    }))
    .filter((c) => Number.isFinite(c.id) && c.id > 0)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.rate - b.rate);
  if (!couriers.length) {
    throw new ShipmentActionError(
      result?.message
        ? `Shiprocket: ${result.message}`
        : "No courier services this delivery pincode.",
    );
  }
  return couriers;
}
