/**
 * Order-tracking model shared by the browser and the server.
 *
 * Shiprocket's original `tracking_data` object is stored untouched in
 * orders.shiprocket_tracking. Everything here is a read-only interpretation of
 * that data (plus the order's own status) for display: nothing is invented,
 * and an event that can't be recognised is shown as-is but never used to move
 * the order forward.
 */

export const STAGES = ["confirmation", "fulfillment", "transit", "delivery"] as const;
export type Stage = (typeof STAGES)[number];

export type Exception =
  | "awaiting_payment"
  | "cancelled"
  | "rto"
  | "returned"
  | "failed_delivery"
  | "delayed"
  | "pickup_issue"
  | "lost"
  | "damaged";

export type TrackingEvent = {
  at: Date | null;
  rawDate: string | null;
  status: string;
  activity: string | null;
  location: string | null;
  stage: Stage | null;
  exception: Exception | null;
};

export type ParsedTracking = {
  currentStatus: string | null;
  currentCode: number | null;
  awb: string | null;
  courier: string | null;
  etd: Date | null;
  pickupDate: Date | null;
  deliveredDate: Date | null;
  trackUrl: string | null;
  /** Newest first. */
  events: TrackingEvent[];
  error: string | null;
};

// ---------------------------------------------------------------------------
// Status classification
// ---------------------------------------------------------------------------

type Classification = { stage: Stage | null; exception: Exception | null };

/**
 * Keyword rules over Shiprocket's status labels, checked in order (first match
 * wins), so e.g. "RTO DELIVERED" and "UNDELIVERED" never count as delivered.
 */
const LABEL_RULES: [RegExp, Classification][] = [
  [/\bRTO\b.*\bDELIVERED\b|RETURNED TO (SELLER|ORIGIN)|REACHED BACK AT SELLER/, { stage: null, exception: "returned" }],
  [/\bRTO\b|RETURN/, { stage: null, exception: "rto" }],
  [/CANCEL/, { stage: null, exception: "cancelled" }],
  [/UNDELIVERED|\bNDR\b|DELIVERY FAILED|FAILED DELIVERY|FAILED ATTEMPT|ISSUE RELATED TO THE RECIPIENT/, { stage: "transit", exception: "failed_delivery" }],
  [/\bLOST\b|UNTRACEABLE|DESTROYED|DISPOSED/, { stage: null, exception: "lost" }],
  [/DAMAGED/, { stage: null, exception: "damaged" }],
  [/PICKUP (EXCEPTION|ERROR)|PICK ?UP FAILED/, { stage: "fulfillment", exception: "pickup_issue" }],
  [/DELAYED|MISROUTED/, { stage: "transit", exception: "delayed" }],
  [/PARTIAL(LY)? DELIVERED/, { stage: "transit", exception: null }],
  [/\bDELIVERED\b/, { stage: "delivery", exception: null }],
  [
    /OUT FOR DELIVERY|IN TRANSIT|TRANSIT|SHIPPED|PICKED ?UP|REACHED|\bHUB\b|IN FLIGHT|HANDOVER|HANDED OVER|CONNECTION|CUSTOM(S)? CLEARED|DISPATCHED|BAGGED|ARRIVED|DEPARTED/,
    { stage: "transit", exception: null },
  ],
  [
    /PICKUP|OUT FOR PICK|AWB ASSIGNED|MANIFEST|PACKED|PACKING|READY TO (SHIP|PACK)|PICKLIST|BOOKED|PROCESSED|FULFILLED|FC ALLOCATED|LABEL GENERATED|INVOICED|^NEW$/,
    { stage: "fulfillment", exception: null },
  ],
];

export function classifyStatus(label: string | null | undefined): Classification {
  const text = (label ?? "").toUpperCase().replace(/[_-]+/g, " ").trim();
  if (!text || text === "NA" || text === "N/A") return { stage: null, exception: null };
  for (const [pattern, result] of LABEL_RULES) if (pattern.test(text)) return result;
  return { stage: null, exception: null };
}

// ---------------------------------------------------------------------------
// Parsing Shiprocket's tracking_data
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) =>
  typeof v === "string" && v.trim() && v.trim().toUpperCase() !== "NA" ? v.trim() : null;

/** Shiprocket timestamps are IST wall-clock strings such as "2026-11-16 14:23:18". */
export function parseShiprocketDate(value: unknown): Date | null {
  const s = str(value);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}T${m[2] ?? "00:00:00"}${m[2]?.length === 5 ? ":00" : ""}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Webhook times come as "2026-11-16 14:23:18" or "16 11 2026 14:23:18" (IST). */
export function parseWebhookTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const dmy = /^(\d{2})[ -/](\d{2})[ -/](\d{4})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(value.trim());
  if (dmy) return parseShiprocketDate(`${dmy[3]}-${dmy[2]}-${dmy[1]} ${dmy[4]}`);
  return parseShiprocketDate(value);
}

export function parseTracking(raw: unknown): ParsedTracking | null {
  if (!isObj(raw)) return null;
  const track = Array.isArray(raw["shipment_track"]) ? raw["shipment_track"].filter(isObj) : [];
  const first = track[0] ?? {};
  const activities = Array.isArray(raw["shipment_track_activities"])
    ? raw["shipment_track_activities"].filter(isObj)
    : [];

  const events: TrackingEvent[] = activities.map((a) => {
    const label = str(a["sr-status-label"]);
    const activity = str(a["activity"]);
    const status = label ?? activity ?? str(a["status"]) ?? "Update";
    // The Shiprocket label is authoritative; fall back to the courier's text.
    let c = classifyStatus(label);
    if (!c.stage && !c.exception) c = classifyStatus(activity);
    return {
      at: parseShiprocketDate(a["date"]),
      rawDate: str(a["date"]),
      status,
      activity,
      location: str(a["location"]),
      ...c,
    };
  });
  events.sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0));

  const codeRaw = raw["shipment_status"] ?? first["shipment_status"];
  const code = typeof codeRaw === "number" ? codeRaw : Number.parseInt(String(codeRaw ?? ""), 10);

  return {
    currentStatus: str(first["current_status"]) ?? events[0]?.status ?? null,
    currentCode: Number.isFinite(code) ? code : null,
    awb: str(first["awb_code"]),
    courier: str(first["courier_name"]) ?? str(raw["courier_name"]),
    etd: parseShiprocketDate(raw["etd"]) ?? parseShiprocketDate(first["edd"]),
    pickupDate: parseShiprocketDate(first["pickup_date"]),
    deliveredDate: parseShiprocketDate(first["delivered_date"]),
    trackUrl: str(raw["track_url"]),
    events,
    error: str(raw["error"]),
  };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type TrackableOrder = {
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  shiprocket_order_id: string | null;
  shiprocket_awb: string | null;
  shiprocket_status: string | null;
  shiprocket_courier: string | null;
  shiprocket_etd: string | null;
  shiprocket_track_url: string | null;
  shiprocket_tracking: unknown;
  shipment_created_at: string | null;
  tracking_synced_at: string | null;
};

export type StageView = {
  stage: Stage;
  state: "complete" | "current" | "upcoming";
  at: Date | null;
};

export type Timeline = {
  stages: StageView[];
  exception: Exception | null;
  tracking: ParsedTracking | null;
  currentStatus: string | null;
  trackUrl: string | null;
  awb: string | null;
  courier: string | null;
  etd: Date | null;
};

const ORDER_STATUS_STAGE: Record<string, number> = {
  confirmed: 0,
  processing: 1,
  packed: 1,
  shipped: 2,
  delivered: 3,
};

/** Statuses after which Shiprocket data no longer changes. */
export function isTrackingFinal(t: Timeline) {
  return (
    t.stages[3]!.state === "complete" ||
    t.exception === "returned" ||
    t.exception === "cancelled" ||
    t.exception === "lost"
  );
}

export function buildTimeline(order: TrackableOrder): Timeline {
  const tracking = parseTracking(order.shiprocket_tracking);
  const hasShipment = Boolean(order.shiprocket_order_id);
  const events = tracking?.events ?? [];

  const currentStatus = order.shiprocket_status ?? tracking?.currentStatus ?? null;
  const current = classifyStatus(currentStatus);

  // Furthest stage evidenced by real data.
  let reached = -1;
  if (order.status !== "pending") reached = 0;
  const fromOrder = ORDER_STATUS_STAGE[order.status];
  if (fromOrder !== undefined) {
    // Once a Shiprocket shipment exists, only Shiprocket can confirm delivery.
    reached = Math.max(reached, hasShipment ? Math.min(fromOrder, 2) : fromOrder);
  }
  if (hasShipment) reached = Math.max(reached, 1);
  for (const e of events) if (e.stage) reached = Math.max(reached, STAGES.indexOf(e.stage));
  if (current.stage) reached = Math.max(reached, STAGES.indexOf(current.stage));
  if (tracking?.pickupDate) reached = Math.max(reached, 2);
  if (tracking?.deliveredDate && !current.exception) reached = Math.max(reached, 3);

  let exception: Exception | null = current.exception;
  if (order.status === "cancelled") exception = "cancelled";
  else if (order.status === "refunded") exception = exception ?? "returned";
  else if (order.status === "pending")
    exception = order.payment_method === "cod" ? null : "awaiting_payment";

  const firstAt = (stage: Stage) =>
    events
      .filter((e) => e.stage === stage && e.at)
      .reduce<Date | null>((min, e) => (!min || e.at! < min ? e.at! : min), null);

  const stageAt: Record<Stage, Date | null> = {
    confirmation: reached >= 0 ? new Date(order.created_at) : null,
    fulfillment:
      firstAt("fulfillment") ??
      (order.shipment_created_at ? new Date(order.shipment_created_at) : null),
    transit: tracking?.pickupDate ?? firstAt("transit"),
    delivery: tracking?.deliveredDate ?? firstAt("delivery"),
  };

  const delivered = reached === 3;
  const stages = STAGES.map<StageView>((stage, i) => ({
    stage,
    state: delivered || i < reached ? "complete" : i === reached ? "current" : "upcoming",
    at: i <= reached ? stageAt[stage] : null,
  }));

  return {
    stages,
    exception,
    tracking,
    currentStatus,
    trackUrl:
      order.shiprocket_track_url ??
      tracking?.trackUrl ??
      (order.shiprocket_awb
        ? `https://shiprocket.co/tracking/${encodeURIComponent(order.shiprocket_awb)}`
        : null),
    awb: order.shiprocket_awb ?? tracking?.awb ?? null,
    courier: order.shiprocket_courier ?? tracking?.courier ?? null,
    etd: parseShiprocketDate(order.shiprocket_etd) ?? tracking?.etd ?? null,
  };
}

export const STAGE_LABELS: Record<Stage, string> = {
  confirmation: "Confirmation",
  fulfillment: "Fulfillment",
  transit: "Transit",
  delivery: "Delivery",
};

export const EXCEPTION_COPY: Record<Exception, { title: string; body: string; severe: boolean }> = {
  awaiting_payment: {
    title: "Awaiting payment",
    body: "This order will be confirmed once payment is received.",
    severe: false,
  },
  cancelled: {
    title: "Shipment cancelled",
    body: "This order or its shipment has been cancelled.",
    severe: true,
  },
  rto: {
    title: "Returning to sender",
    body: "The courier is returning this shipment to us. We'll be in touch about next steps.",
    severe: true,
  },
  returned: {
    title: "Returned to sender",
    body: "This shipment has been returned to us.",
    severe: true,
  },
  failed_delivery: {
    title: "Delivery attempt unsuccessful",
    body: "The courier couldn't complete delivery. They'll usually try again; please keep your phone reachable.",
    severe: false,
  },
  delayed: {
    title: "Shipment delayed",
    body: "Your shipment is taking longer than expected. It's still on its way.",
    severe: false,
  },
  pickup_issue: {
    title: "Pickup delayed",
    body: "The courier hasn't been able to collect this shipment yet. We're arranging it.",
    severe: false,
  },
  lost: {
    title: "Shipment issue",
    body: "The courier has reported a problem with this shipment. We'll contact you.",
    severe: true,
  },
  damaged: {
    title: "Shipment damaged",
    body: "The courier has reported damage to this shipment. We'll contact you.",
    severe: true,
  },
};

// ---------------------------------------------------------------------------
// Automatic order-status updates
// ---------------------------------------------------------------------------

/** Fulfilment order of the site's own order statuses. */
const STATUS_RANK: Record<string, number> = {
  confirmed: 0,
  processing: 1,
  packed: 2,
  shipped: 3,
  delivered: 4,
};

export type AutoStatus = "processing" | "shipped" | "delivered";

/**
 * The order status Shiprocket's data proves, or null when it proves nothing.
 *
 * - delivered: only when Shiprocket's current status is a real delivery (never
 *   "RTO delivered", "undelivered" or partial delivery);
 * - shipped: the courier has actually picked the parcel up (a pickup date or a
 *   pickup/transit scan) — creating a shipment alone never counts;
 * - processing: Shiprocket shows fulfilment activity (AWB assigned, pickup
 *   scheduled, packed, …).
 */
export function statusFromTracking(parsed: ParsedTracking | null): AutoStatus | null {
  if (!parsed) return null;
  const current = classifyStatus(parsed.currentStatus);
  if (current.stage === "delivery" && !current.exception) return "delivered";

  const stages = new Set<Stage>();
  if (current.stage) stages.add(current.stage);
  for (const e of parsed.events) if (e.stage) stages.add(e.stage);
  if (parsed.pickupDate) stages.add("transit");

  if (stages.has("transit") || stages.has("delivery")) return "shipped";
  if (stages.has("fulfillment")) return "processing";
  return null;
}

/**
 * Whether an order may move from `current` to `next` automatically: forward
 * only, never out of pending (unpaid), cancelled or refunded.
 */
export function canAutoAdvance(current: string, next: AutoStatus) {
  const from = STATUS_RANK[current];
  return from !== undefined && from < STATUS_RANK[next]!;
}

/** Statuses an order may be in for an automatic move to `next` (for a race-safe update). */
export function autoAdvanceFrom(next: AutoStatus) {
  return Object.keys(STATUS_RANK).filter((s) => canAutoAdvance(s, next));
}

/** How long stored tracking is considered fresh before Shiprocket is asked again. */
export const TRACKING_FRESH_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Shiprocket order snapshot (GET /orders/show/{id})
// ---------------------------------------------------------------------------

/**
 * What Shiprocket's order record says about courier, AWB and pickup. The
 * tracking API has nothing to report until the courier scans the parcel, so
 * this is the only source for the steps before pickup.
 */
export type ShiprocketOrderSnapshot = {
  status: string | null;
  awb: string | null;
  courier: string | null;
  pickupScheduledAt: Date | null;
  pickupToken: string | null;
  etd: Date | null;
};

export function parseShiprocketOrder(body: unknown): ShiprocketOrderSnapshot | null {
  const data = isObj(body) && isObj(body["data"]) ? body["data"] : null;
  if (!data) return null;
  const rawShipments = data["shipments"];
  const shipment = Array.isArray(rawShipments)
    ? (rawShipments.find(isObj) ?? {})
    : isObj(rawShipments)
      ? rawShipments
      : {};
  const awbData = isObj(data["awb_data"]) ? data["awb_data"] : {};
  const text = (v: unknown) =>
    typeof v === "number" ? String(v) : str(v);
  return {
    status: str(data["status"]),
    awb: text(shipment["awb"]) ?? text(awbData["awb"]),
    courier: str(shipment["courier"]) ?? str(data["courier_name"]),
    pickupScheduledAt: parseShiprocketDate(shipment["pickup_scheduled_date"]),
    pickupToken: text(shipment["pickup_token_number"]),
    etd: parseShiprocketDate(shipment["etd"]) ?? parseShiprocketDate(data["etd"]),
  };
}

// ---------------------------------------------------------------------------
// Shipment phase (customer & admin wording)
// ---------------------------------------------------------------------------

export type ShipmentPhase =
  | "not_created"
  | "awaiting_awb"
  | "awaiting_pickup"
  | "pickup_scheduled"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returning"
  | "returned"
  | "cancelled";

export type PhaseOrder = TrackableOrder & {
  pickup_scheduled_at?: string | null;
};

export const AWAITING_COURIER_MESSAGE =
  "Your order has been packed and is awaiting courier assignment. Tracking details will be available once the courier is assigned.";

/**
 * Where the shipment really is, from stored Shiprocket data only. "Packed"
 * on our side never implies a courier, an AWB or a pickup.
 */
export function shipmentPhase(order: PhaseOrder): ShipmentPhase {
  const t = buildTimeline(order);
  if (t.exception === "cancelled") return "cancelled";
  if (t.exception === "returned") return "returned";
  if (t.exception === "rto") return "returning";
  if (t.stages[3]!.state === "complete") return "delivered";
  if (!order.shiprocket_order_id) return "not_created";
  if (/OUT FOR DELIVERY/i.test(t.currentStatus ?? "")) return "out_for_delivery";
  if (t.stages[2]!.state !== "upcoming") return "in_transit";
  if (!t.awb) return "awaiting_awb";
  if (order.pickup_scheduled_at || /PICKUP (SCHEDULED|GENERATED|QUEUED)|OUT FOR PICKUP/i.test(t.currentStatus ?? "")) {
    return "pickup_scheduled";
  }
  return "awaiting_pickup";
}

export const PHASE_LABELS: Record<ShipmentPhase, string> = {
  not_created: "Shipment not created",
  awaiting_awb: "Awaiting courier assignment",
  awaiting_pickup: "Courier assigned · awaiting pickup",
  pickup_scheduled: "Pickup scheduled",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returning: "Returning to sender",
  returned: "Returned to sender",
  cancelled: "Shipment cancelled",
};
