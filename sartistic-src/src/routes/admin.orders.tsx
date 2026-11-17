import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markCodPaymentReceived } from "@/lib/admin.functions";
import {
  assignShiprocketAwb,
  createShiprocketShipment,
  getShiprocketCouriers,
  scheduleShiprocketPickup,
} from "@/lib/shipping.functions";
import { refreshOrderTracking } from "@/lib/tracking.functions";
import { buildTimeline, EXCEPTION_COPY, PHASE_LABELS, shipmentPhase } from "@/lib/tracking";
import { OrderTracker } from "@/components/site/OrderTracker";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatDate, formatPrice, ORDER_STATUSES, PAYMENT_STATUSES, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, Panel, StatusPill, selectClass, useConfirm } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/orders")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
  }),
  component: AdminOrders,
});

function paymentTone(s: string) {
  return s === "paid" ? "good" : s === "failed" ? "bad" : s === "refunded" ? "neutral" : "warn";
}
function statusTone(s: string) {
  return s === "delivered" ? "good" : s === "cancelled" || s === "refunded" ? "bad" : "neutral";
}

function paymentLabel(o: { payment_method: string; payment_status: string }) {
  return o.payment_method === "cod"
    ? `COD · ${titleCase(o.payment_status)}`
    : titleCase(o.payment_status);
}

function trackingUrl(awb: string) {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function AdminOrders() {
  const queryClient = useQueryClient();
  const { q } = Route.useSearch();
  const [confirm, confirmDialog] = useConfirm();
  const [search, setSearch] = useState(q ?? "");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [method, setMethod] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function updateStatus(
    order: {
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      payment_method: string;
    },
    next: string,
  ) {
    if (next === order.status) return;
    const risky = next === "cancelled" || next === "refunded";
    // COD orders are unpaid until the courier collects, so shipping them is normal.
    const unpaidShipping =
      order.payment_method !== "cod" &&
      order.payment_status !== "paid" &&
      ["packed", "shipped", "delivered"].includes(next);
    if (risky || unpaidShipping) {
      const ok = await confirm({
        title: `Mark ${order.order_number} as ${titleCase(next)}?`,
        description: unpaidShipping
          ? `This order's payment is “${titleCase(order.payment_status)}”, not paid. Only continue if you're sure.`
          : next === "refunded"
            ? "This only updates the fulfilment status. Issue the actual refund from your Razorpay dashboard."
            : "The customer will see this order as cancelled.",
        confirmLabel: `Mark ${titleCase(next)}`,
        destructive: risky,
      });
      if (!ok) return;
    }
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", order.id);
    if (error) toast.error("Couldn't update order status");
    else {
      toast.success(`Order ${order.order_number} → ${titleCase(next)}`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "order-history", order.id] });
    }
  }

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!payment || o.payment_status === payment) &&
        (!method || o.payment_method === method) &&
        (!term ||
          `${o.order_number} ${o.shipping_name} ${o.shipping_email ?? ""} ${o.shipping_phone} ${o.razorpay_payment_id ?? ""} ${o.razorpay_order_id ?? ""} ${o.shiprocket_awb ?? ""}`
            .toLowerCase()
            .includes(term)),
    );
  }, [orders.data, search, status, payment, method]);

  const paidTotal = list
    .filter((o) => o.payment_status === "paid")
    .reduce((s, o) => s + Number(o.total), 0);

  return (
    <div>
      {confirmDialog}
      <PageHeader
        title="Orders"
        description="Online payments are confirmed only by verified Razorpay payments and webhooks. Cash on Delivery payments are marked received here once the courier has collected them."
      />

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Order no., name, email, phone or payment ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-none pl-9"
          />
        </div>
        <select
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          className={selectClass}
        >
          <option value="">All payment statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              Payment: {titleCase(s)}
            </option>
          ))}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectClass}>
          <option value="">All payment methods</option>
          <option value="razorpay">Online (Razorpay)</option>
          <option value="cod">Cash on Delivery</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="">All fulfilment statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {list.length} orders · {formatPrice(paidTotal)} paid
      </p>

      <div className="mt-4 space-y-2">
        {orders.isLoading && <p className="text-sm text-muted-foreground">Loading orders…</p>}
        {orders.isError && <p className="text-sm text-destructive">Couldn't load orders.</p>}
        {!orders.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">No orders found.</p>
        )}
        {list.map((o) => {
          const isOpen = open === o.id;
          const itemCount = o.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
          return (
            <div key={o.id} className="border border-border bg-background">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : o.id)}
                className="grid w-full grid-cols-2 items-center gap-x-4 gap-y-2 p-4 text-left text-sm md:grid-cols-[1.2fr_1.5fr_1fr_0.8fr_auto_auto_auto]"
              >
                <span className="font-medium">{o.order_number}</span>
                <span className="truncate text-muted-foreground">
                  {o.shipping_name}
                  {o.shiprocket_status && (
                    <span className="block truncate text-xs">
                      <ShipmentStatusText order={o} />
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">{formatDate(o.created_at)}</span>
                <span>
                  {formatPrice(o.total)}{" "}
                  <span className="text-xs text-muted-foreground">· {itemCount} items</span>
                </span>
                <StatusPill tone={paymentTone(o.payment_status)}>{paymentLabel(o)}</StatusPill>
                <StatusPill tone={statusTone(o.status)}>{titleCase(o.status)}</StatusPill>
                <ChevronDown
                  className={cn(
                    "hidden size-4 transition-transform md:block",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <OrderDetail
                  order={o}
                  onStatus={(next) => void updateStatus(o, next)}
                  confirm={confirm}
                  onChanged={() => {
                    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
                    void queryClient.invalidateQueries({
                      queryKey: ["admin", "order-history", o.id],
                    });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Order = Tables<"orders"> & { order_items: Tables<"order_items">[] };

type ConfirmFn = ReturnType<typeof useConfirm>[0];

function OrderDetail({
  order: o,
  onStatus,
  confirm,
  onChanged,
}: {
  order: Order;
  onStatus: (next: string) => void;
  confirm: ConfirmFn;
  onChanged: () => void;
}) {
  const markReceived = useServerFn(markCodPaymentReceived);
  const refreshTracking = useServerFn(refreshOrderTracking);
  const [refreshing, setRefreshing] = useState(false);

  async function forceRefresh() {
    setRefreshing(true);
    try {
      const r = await refreshTracking({ data: { orderId: o.id, force: true } });
      if (r.outcome === "synced")
        toast.success(
          r.orderStatus
            ? `Tracking updated · order moved to ${titleCase(r.orderStatus)}`
            : "Tracking updated from Shiprocket",
        );
      else if (r.outcome === "fresh") toast("Tracking was refreshed less than a minute ago");
      else if (r.outcome === "unavailable") toast.error(r.reason);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't refresh tracking");
    } finally {
      setRefreshing(false);
    }
  }
  const [marking, setMarking] = useState(false);
  const isCod = o.payment_method === "cod";

  async function markCodPaid() {
    const ok = await confirm({
      title: `Mark ${o.order_number} as paid?`,
      description: `Only do this after the courier has collected ${formatPrice(o.total)} from the customer. Your account and the time are recorded, and this can't be undone here.`,
      confirmLabel: "Mark payment received",
    });
    if (!ok) return;
    setMarking(true);
    try {
      await markReceived({ data: { orderId: o.id } });
      toast.success(`COD payment for ${o.order_number} marked received`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the payment");
    } finally {
      setMarking(false);
    }
  }

  const history = useQuery({
    queryKey: ["admin", "order-history", o.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select("id, field, old_value, new_value, source, created_at")
        .eq("order_id", o.id)
        .order("created_at");
      if (error) return [];
      return data ?? [];
    },
  });

  return (
    <div className="grid gap-4 border-t border-border p-4 md:p-5 lg:grid-cols-3">
      <Panel title="Items" className="lg:col-span-2">
        <ul className="divide-y divide-border">
          {o.order_items?.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
              {i.image_url ? (
                <img src={i.image_url} alt="" className="size-12 object-cover" />
              ) : (
                <span className="size-12 bg-secondary" />
              )}
              <div className="flex-1">
                <p>
                  {i.product_name}
                  {i.variant_name ? (
                    <span className="text-muted-foreground"> · {i.variant_name}</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {i.sku ?? "—"} · {formatPrice(i.unit_price)} × {i.quantity}
                </p>
              </div>
              <span>{formatPrice(i.total_price)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <Row label="Subtotal" value={formatPrice(o.subtotal)} />
          <Row
            label={`Discount${o.coupon_code ? ` (${o.coupon_code})` : ""}`}
            value={`− ${formatPrice(o.discount)}`}
          />
          <Row label="Shipping" value={formatPrice(o.shipping_fee)} />
          <Row label="Total" value={formatPrice(o.total)} strong />
        </dl>
      </Panel>

      <div className="space-y-4">
        <Panel title="Fulfilment">
          <select
            value={o.status}
            onChange={(e) => onStatus(e.target.value)}
            className={selectClass}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            Updated {formatDateTime(o.updated_at)}
          </p>
        </Panel>

        <Panel title="Payment">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Method</span>
              <span>{isCod ? "Cash on Delivery" : "Online (Razorpay)"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <StatusPill tone={paymentTone(o.payment_status)}>
                {titleCase(o.payment_status)}
              </StatusPill>
            </div>
            {isCod ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Amount to collect: {formatPrice(o.total)}
                </p>
                {o.payment_collected_at && (
                  <p className="text-xs text-muted-foreground">
                    Marked received {formatDateTime(o.payment_collected_at)}
                  </p>
                )}
                {o.payment_status === "pending" &&
                  !["cancelled", "refunded"].includes(o.status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={marking}
                      onClick={() => void markCodPaid()}
                      className="w-full rounded-none"
                    >
                      {marking ? "Saving…" : "Mark payment received"}
                    </Button>
                  )}
              </>
            ) : (
              <p className="text-xs break-all text-muted-foreground">
                Razorpay order: {o.razorpay_order_id ?? "—"}
                <br />
                Razorpay payment: {o.razorpay_payment_id ?? "—"}
              </p>
            )}
            {o.razorpay_payment_id && (
              <a
                href={`https://dashboard.razorpay.com/app/payments/${o.razorpay_payment_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs underline underline-offset-4"
              >
                Open in Razorpay
              </a>
            )}
          </div>
        </Panel>

        <ShipmentPanel order={o} confirm={confirm} onChanged={onChanged} />

        <Panel title="Customer & shipping">
          <p className="text-sm">
            {o.shipping_name}
            <br />
            {o.shipping_email && (
              <a className="underline underline-offset-4" href={`mailto:${o.shipping_email}`}>
                {o.shipping_email}
              </a>
            )}
            <br />
            <a className="underline underline-offset-4" href={`tel:${o.shipping_phone}`}>
              {o.shipping_phone}
            </a>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {o.shipping_address}, {o.shipping_city}, {o.shipping_state} {o.shipping_postal_code},{" "}
            {o.shipping_country}
          </p>
        </Panel>
      </div>

      {o.shiprocket_order_id && (
        <Panel title="Shipment tracking" className="lg:col-span-3">
          <OrderTracker order={o} onRefresh={() => void forceRefresh()} refreshing={refreshing} />
        </Panel>
      )}

      {(o.shiprocket_order_id || o.shipment_requested_at) && <ShiprocketLogPanel orderId={o.id} />}

      <Panel title="History" className="lg:col-span-3">
        <ol className="space-y-2 text-sm">
          <li className="flex gap-3">
            <span className="w-44 shrink-0 text-muted-foreground">
              {formatDateTime(o.created_at)}
            </span>
            <span>Order placed</span>
          </li>
          {history.data?.map((h) => (
            <li key={h.id} className="flex gap-3">
              <span className="w-44 shrink-0 text-muted-foreground">
                {formatDateTime(h.created_at)}
              </span>
              <span>
                {h.field === "payment_status" ? "Payment" : "Fulfilment"}:{" "}
                {h.old_value ? titleCase(h.old_value) : "—"} →{" "}
                <strong className="font-medium">{titleCase(h.new_value)}</strong>
                <span className="text-muted-foreground">
                  {" "}
                  · {h.source === "admin" ? "by admin" : "automatic"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function ShipmentPanel({
  order: o,
  confirm,
  onChanged,
}: {
  order: Order;
  confirm: ConfirmFn;
  onChanged: () => void;
}) {
  const createShipment = useServerFn(createShiprocketShipment);
  const [busy, setBusy] = useState(false);
  const [pkg, setPkg] = useState({
    weightKg: "0.5",
    lengthCm: "15",
    breadthCm: "10",
    heightCm: "8",
  });
  const [dispatch, setDispatch] = useState(true);
  const assignAwb = useServerFn(assignShiprocketAwb);
  const schedulePickup = useServerFn(scheduleShiprocketPickup);
  const isCod = o.payment_method === "cod";

  if (o.shiprocket_order_id) return <ShipmentOps order={o} onChanged={onChanged} />;

  const blocked = ["pending", "cancelled", "refunded"].includes(o.status)
    ? `A ${o.status} order can't be shipped.`
    : !isCod && o.payment_status !== "paid"
      ? "Prepaid orders can be shipped once payment is confirmed."
      : isCod && ["failed", "refunded"].includes(o.payment_status)
        ? `Payment is ${o.payment_status}.`
        : null;

  async function submit() {
    const values = {
      weightKg: Number(pkg.weightKg),
      lengthCm: Number(pkg.lengthCm),
      breadthCm: Number(pkg.breadthCm),
      heightCm: Number(pkg.heightCm),
    };
    if (Object.values(values).some((v) => !Number.isFinite(v) || v <= 0)) {
      toast.error("Enter a valid package weight and dimensions");
      return;
    }
    const ok = await confirm({
      title: `Send ${o.order_number} to Shiprocket?`,
      description: isCod
        ? `This creates a COD shipment. The courier will collect ${formatPrice(o.total)} from the customer.`
        : "This creates a prepaid shipment (nothing to collect on delivery).",
      confirmLabel: "Create shipment",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await createShipment({ data: { orderId: o.id, ...values } });
      toast.success(
        result.created
          ? `Shiprocket order ${result.shiprocketOrderId} created`
          : "This order already has a Shiprocket shipment",
      );
      if (dispatch) {
        // Without a courier (AWB) and a pickup, Shiprocket leaves the order
        // as NEW and nothing can be tracked. Each step is safe to retry.
        const awb = await assignAwb({ data: { orderId: o.id } });
        toast.success(`Courier assigned · AWB ${awb.awb}${awb.courier ? ` (${awb.courier})` : ""}`);
        await schedulePickup({ data: { orderId: o.id } });
        toast.success("Pickup scheduled with the courier");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the shipment");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <Panel title="Shipment">
      {blocked ? (
        <p className="text-xs text-muted-foreground">{blocked}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {isCod
              ? `COD · courier collects ${formatPrice(o.total)}`
              : "Prepaid · nothing to collect"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["weightKg", "Weight (kg)"],
                ["lengthCm", "Length (cm)"],
                ["breadthCm", "Breadth (cm)"],
                ["heightCm", "Height (cm)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs text-muted-foreground">
                {label}
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={pkg[key]}
                  onChange={(e) => setPkg((p) => ({ ...p, [key]: e.target.value }))}
                  className="mt-1 h-9 rounded-none"
                />
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={dispatch}
              onChange={(e) => setDispatch(e.target.checked)}
              className="mt-0.5"
            />
            Also assign a courier (AWB) and schedule pickup — needed before the parcel can be
            tracked
          </label>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-none"
          >
            {busy ? "Creating…" : "Create Shiprocket shipment"}
          </Button>
        </div>
      )}
    </Panel>
  );
}

function ShipmentStatusText({ order }: { order: Order }) {
  const exception = buildTimeline(order).exception;
  const severe = exception ? EXCEPTION_COPY[exception].severe : false;
  return (
    <span className={cn(exception && (severe ? "text-destructive" : "text-amber-700 dark:text-amber-400"))}>
      {order.shiprocket_status}
    </span>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "font-medium")}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type Courier = Awaited<ReturnType<typeof getShiprocketCouriers>>[number];

/**
 * Shipment state and the actions that move it forward. Every action is safe
 * to retry: the server re-reads Shiprocket first, so it never assigns a
 * second AWB or books a second pickup.
 */
function ShipmentOps({ order: o, onChanged }: { order: Order; onChanged: () => void }) {
  const assign = useServerFn(assignShiprocketAwb);
  const pickup = useServerFn(scheduleShiprocketPickup);
  const loadCouriers = useServerFn(getShiprocketCouriers);
  const refresh = useServerFn(refreshOrderTracking);
  const [busy, setBusy] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [courierId, setCourierId] = useState("");

  const phase = shipmentPhase(o);
  const timeline = buildTimeline(o);
  const closed =
    ["cancelled", "refunded"].includes(o.status) ||
    ["cancelled", "returned", "returning", "delivered"].includes(phase);
  const isCod = o.payment_method === "cod";

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    try {
      toast.success(await action());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shiprocket request failed");
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  const check = () =>
    run("check", async () => {
      const r = await refresh({ data: { orderId: o.id, force: true } });
      if (r.outcome === "unavailable") throw new Error(r.reason);
      if (r.outcome === "fresh") return "Checked less than a minute ago";
      return r.outcome === "synced" && r.orderStatus
        ? `Updated from Shiprocket · order moved to ${titleCase(r.orderStatus)}`
        : "Updated from Shiprocket";
    });

  const assignAwb = () =>
    run("awb", async () => {
      const r = await assign({
        data: { orderId: o.id, ...(courierId ? { courierId: Number(courierId) } : {}) },
      });
      return `${r.alreadyAssigned ? "Already assigned" : "Courier assigned"} · AWB ${r.awb}${r.courier ? ` (${r.courier})` : ""}`;
    });

  const bookPickup = () =>
    run("pickup", async () => {
      const r = await pickup({ data: { orderId: o.id } });
      return r.alreadyScheduled ? "Pickup was already scheduled" : "Pickup scheduled";
    });

  async function showCouriers() {
    setBusy("couriers");
    try {
      setCouriers(await loadCouriers({ data: { orderId: o.id } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load couriers");
    } finally {
      setBusy(null);
    }
  }

  const pickupText = o.pickup_scheduled_at
    ? `Scheduled ${formatDateTime(o.pickup_scheduled_at)}${o.pickup_token ? ` · ${o.pickup_token}` : ""}`
    : o.shiprocket_awb
      ? "Not scheduled"
      : "Needs a courier first";
  const phaseTone =
    phase === "delivered" ? "good" : ["cancelled", "returned", "returning"].includes(phase) ? "bad" : "neutral";

  return (
    <Panel title="Shipment">
      <dl className="space-y-1 text-xs">
        <ShipRow label="Shipment status">
          <StatusPill tone={phaseTone}>{PHASE_LABELS[phase]}</StatusPill>
        </ShipRow>
        <ShipRow label="Shiprocket status">{o.shiprocket_status ?? "—"}</ShipRow>
        <ShipRow label="Shiprocket order">{o.shiprocket_order_id}</ShipRow>
        <ShipRow label="Shipment ID">{o.shiprocket_shipment_id ?? "—"}</ShipRow>
        <ShipRow label="AWB">{o.shiprocket_awb ?? "Not assigned"}</ShipRow>
        <ShipRow label="Courier">{o.shiprocket_courier ?? "—"}</ShipRow>
        <ShipRow label="Pickup">{pickupText}</ShipRow>
        <ShipRow label="Type">{isCod ? `COD · collect ${formatPrice(o.total)}` : "Prepaid"}</ShipRow>
        <ShipRow label="Tracking URL">
          {timeline.trackUrl && timeline.awb ? (
            <a
              href={timeline.trackUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Open tracking
            </a>
          ) : (
            "Available once an AWB is assigned"
          )}
        </ShipRow>
        <ShipRow label="Last tracking update">
          {o.tracking_synced_at ? formatDateTime(o.tracking_synced_at) : "Never"}
        </ShipRow>
        {o.shipment_created_at && (
          <ShipRow label="Shipment created">{formatDateTime(o.shipment_created_at)}</ShipRow>
        )}
        {o.awb_assigned_at && (
          <ShipRow label="AWB assigned">{formatDateTime(o.awb_assigned_at)}</ShipRow>
        )}
      </dl>

      <div className="mt-4 space-y-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => void check()}
          className="w-full rounded-none"
        >
          {busy === "check" ? "Checking…" : "Check / refresh tracking"}
        </Button>

        {!o.shiprocket_awb && !closed && (
          <div className="space-y-2 border-t border-border pt-3">
            {couriers ? (
              <select
                value={courierId}
                onChange={(e) => setCourierId(e.target.value)}
                className={selectClass}
              >
                <option value="">Shiprocket chooses (courier priority)</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {formatPrice(c.rate)}
                    {c.etd ? ` · ETD ${c.etd}` : ""}
                    {c.recommended ? " · recommended" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void showCouriers()}
                className="text-xs underline underline-offset-4 disabled:opacity-50"
              >
                {busy === "couriers" ? "Loading couriers…" : "Choose a courier (optional)"}
              </button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() => void assignAwb()}
              className="w-full rounded-none"
            >
              {busy === "awb" ? "Assigning…" : "Assign courier (AWB)"}
            </Button>
          </div>
        )}

        {o.shiprocket_awb && !o.pickup_scheduled_at && !closed && phase === "awaiting_pickup" && (
          <Button
            type="button"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => void bookPickup()}
            className="w-full rounded-none"
          >
            {busy === "pickup" ? "Scheduling…" : "Schedule pickup"}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function ShipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-all">{children}</dd>
    </div>
  );
}

/** Webhook deliveries and Shiprocket actions for this order, newest first. */
function ShiprocketLogPanel({ orderId }: { orderId: string }) {
  const logs = useQuery({
    queryKey: ["admin", "shiprocket-logs", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shiprocket_logs")
        .select("id, kind, outcome, message, shiprocket_status, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!logs.data?.length) return null;
  return (
    <Panel title="Shiprocket activity" className="lg:col-span-3">
      <ol className="space-y-2 text-sm">
        {logs.data.map((l) => (
          <li key={l.id} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
            <span className="w-44 shrink-0 text-muted-foreground">
              {formatDateTime(l.created_at)}
            </span>
            <span className="min-w-0">
              <StatusPill
                tone={l.outcome === "error" ? "bad" : l.outcome === "ok" ? "good" : "neutral"}
              >
                {l.kind} · {l.outcome}
              </StatusPill>{" "}
              {l.shiprocket_status && (
                <strong className="font-medium">{l.shiprocket_status} </strong>
              )}
              <span className={cn("break-words", l.outcome === "error" && "text-destructive")}>
                {l.message}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
