import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatPrice, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OrderTracker, useTrackingRefresh } from "@/components/site/OrderTracker";

// Poll for up to 3 minutes after checkout while the payment is confirmed
// (by the verification call or, as a fallback, the Razorpay webhook).
const CONFIRM_POLL_MS = 5000;
const CONFIRM_WINDOW_MS = 3 * 60 * 1000;

export const Route = createFileRoute("/account/orders/$id")({
  // `placed` is set when arriving straight from checkout.
  validateSearch: (search: Record<string, unknown>): { placed?: boolean } =>
    search["placed"] === true || search["placed"] === "true" ? { placed: true } : {},
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { placed } = Route.useSearch();
  const { user } = useAuth();

  const [confirmWindowOver, setConfirmWindowOver] = useState(false);
  useEffect(() => {
    if (!placed) return;
    const timer = setTimeout(() => setConfirmWindowOver(true), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [placed]);
  const checking = Boolean(placed) && !confirmWindowOver;

  const order = useQuery({
    queryKey: ["order", id],
    enabled: Boolean(user),
    refetchInterval: (query) =>
      checking &&
      query.state.data?.payment_method !== "cod" &&
      query.state.data?.payment_status === "pending"
        ? CONFIRM_POLL_MS
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Pull fresh Shiprocket tracking at most once per view, only when stale.
  const refetch = order.refetch;
  const onTrackingUpdated = useCallback(() => void refetch(), [refetch]);
  useTrackingRefresh(order.data, onTrackingUpdated);

  if (order.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading order…</p>;
  }
  if (!order.data) {
    return (
      <div>
        <p className="font-display text-2xl">Order not found</p>
        <Link to="/account/orders" className="mt-4 inline-block text-sm underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const data = order.data;
  const isCod = data.payment_method === "cod";

  return (
    <section>
      <Link to="/account/orders" className="text-xs tracking-[0.16em] uppercase hover:text-accent">
        ← Orders
      </Link>
      <h2 className="mt-4 font-display text-3xl">{data.order_number}</h2>
      <p className="text-sm text-muted-foreground">Placed {formatDate(data.created_at)}</p>

      {isCod ? (
        <CodBanner
          placed={Boolean(placed)}
          paymentStatus={data.payment_status}
          status={data.status}
          total={data.total}
        />
      ) : (
        <PaymentBanner
          placed={Boolean(placed)}
          paymentStatus={data.payment_status}
          stillChecking={checking}
        />
      )}

      <div className="mt-10 border border-border px-5 py-8 sm:px-8">
        <p className="eyebrow mb-8">Order tracking</p>
        <OrderTracker order={data} />
      </div>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <div>
          <p className="eyebrow">Items</p>
          <ul className="mt-4 space-y-4 text-sm">
            {data.order_items?.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                {item.image_url && (
                  <img src={item.image_url} alt="" className="size-14 bg-secondary object-cover" />
                )}
                <div className="flex-1">
                  <p>{item.product_name}</p>
                  {item.variant_name && (
                    <p className="text-muted-foreground">{item.variant_name}</p>
                  )}
                  <p className="text-muted-foreground">Qty {item.quantity}</p>
                </div>
                <span>{formatPrice(item.total_price)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow">Summary</p>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={formatPrice(data.subtotal)} />
            <Row label="Discount" value={`− ${formatPrice(data.discount)}`} />
            <Row
              label="Shipping"
              value={Number(data.shipping_fee) ? formatPrice(data.shipping_fee) : "Free"}
            />
            <Row label="Total" value={formatPrice(data.total)} />
            <Row
              label="Payment Method"
              value={isCod ? "Cash on Delivery" : "Online Payment (Razorpay)"}
            />
            <Row
              label="Payment"
              value={
                isCod && data.payment_status === "pending"
                  ? "Due on delivery"
                  : titleCase(data.payment_status)
              }
            />
            {data.razorpay_payment_id && (
              <Row label="Payment reference" value={data.razorpay_payment_id} />
            )}
          </dl>

          <p className="eyebrow mt-8">Shipping to</p>
          <address className="mt-3 text-sm text-muted-foreground not-italic">
            {data.shipping_name}
            <br />
            {data.shipping_address}
            <br />
            {data.shipping_city}, {data.shipping_state} {data.shipping_postal_code}
            <br />
            {data.shipping_country}
            <br />
            {data.shipping_phone}
          </address>
        </div>
      </div>
    </section>
  );
}

function PaymentBanner({
  placed,
  paymentStatus,
  stillChecking,
}: {
  placed: boolean;
  paymentStatus: string;
  stillChecking: boolean;
}) {
  let tone = "border-border";
  let title: string;
  let body: string;

  if (paymentStatus === "paid") {
    if (!placed) return null;
    tone = "border-accent";
    title = "Thank you — your order is confirmed";
    body = "We've received your payment. You'll find all your order details below.";
  } else if (paymentStatus === "pending") {
    if (placed && stillChecking) {
      title = "Confirming your payment…";
      body = "This usually takes a few seconds. This page will update automatically.";
    } else {
      title = "Payment pending";
      body =
        "We haven't received confirmation of a payment for this order yet. If money was deducted, it will be confirmed automatically — or contact us with your order number.";
    }
  } else if (paymentStatus === "failed") {
    tone = "border-destructive";
    title = "Payment unsuccessful";
    body =
      "This payment didn't go through and you have not been charged for it. Please place the order again or contact us for help.";
  } else {
    return null;
  }

  return (
    <div role="status" aria-live="polite" className={cn("mt-6 border p-5", tone)}>
      <p className="font-display text-xl">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function CodBanner({
  placed,
  paymentStatus,
  status,
  total,
}: {
  placed: boolean;
  paymentStatus: string;
  status: string;
  total: number;
}) {
  if (["cancelled", "refunded"].includes(status)) return null;
  const paid = paymentStatus === "paid";
  return (
    <div role="status" aria-live="polite" className="mt-6 border border-accent p-5">
      {placed && (
        <p className="font-display text-xl">Thank you — your order is confirmed</p>
      )}
      <p className={cn("text-sm", placed && "mt-1")}>
        <span className="text-muted-foreground">Payment Method: </span>Cash on Delivery
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {paid
          ? `Payment of ${formatPrice(total)} received. Thank you!`
          : `Pay ${formatPrice(total)} when your order is delivered.`}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
