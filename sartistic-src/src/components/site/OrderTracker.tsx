import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CircleAlert,
  ExternalLink,
  House,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshOrderTracking } from "@/lib/tracking.functions";
import {
  buildTimeline,
  EXCEPTION_COPY,
  isTrackingFinal,
  STAGE_LABELS,
  TRACKING_FRESH_MS,
  type Stage,
  type StageView,
  type Timeline,
  type TrackableOrder,
} from "@/lib/tracking";

const ICONS: Record<Stage, LucideIcon> = {
  confirmation: ShoppingCart,
  fulfillment: Package,
  transit: Truck,
  delivery: House,
};

// Restrained green for completed milestones; brown (primary) for the active one.
const DONE = "border-[#5E7D61] bg-[#5E7D61] text-[#FBF8F1]";
const DONE_LINE = "bg-[#5E7D61]";

export type TrackerOrder = TrackableOrder & { id: string; order_number: string };

function formatStamp(d: Date | null, withTime = true) {
  if (!d) return null;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }),
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Asks the server to refresh tracking once per page view, only when the order
 * has a shipment, isn't in a final state and the stored data is stale. The
 * server applies its own throttle as well.
 */
export function useTrackingRefresh(order: TrackerOrder | null | undefined, onUpdated: () => void) {
  const refresh = useServerFn(refreshOrderTracking);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!order?.shiprocket_order_id || attempted.current === order.id) return;
    const synced = order.tracking_synced_at ? new Date(order.tracking_synced_at).getTime() : 0;
    if (Date.now() - synced < TRACKING_FRESH_MS) return;
    if (order.tracking_synced_at && isTrackingFinal(buildTimeline(order))) return;
    attempted.current = order.id;
    void refresh({ data: { orderId: order.id } })
      .then((r) => {
        if (r.outcome === "synced") onUpdated();
      })
      .catch(() => {});
  }, [order, refresh, onUpdated]);
}

export function OrderTracker({
  order,
  onRefresh,
  refreshing,
}: {
  order: TrackerOrder;
  /** Admin only: force a refresh from Shiprocket. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const timeline = buildTimeline(order);
  const exception = timeline.exception ? EXCEPTION_COPY[timeline.exception] : null;

  return (
    <div>
      <ProgressBar timeline={timeline} severe={Boolean(exception?.severe)} />

      {exception && (
        <div
          role="status"
          className={cn(
            "mt-6 flex gap-3 border p-4 text-sm",
            exception.severe ? "border-destructive/40" : "border-amber-600/40",
          )}
        >
          <CircleAlert
            className={cn(
              "mt-0.5 size-4 shrink-0",
              exception.severe ? "text-destructive" : "text-amber-700 dark:text-amber-400",
            )}
          />
          <div>
            <p className="font-medium">{exception.title}</p>
            <p className="mt-0.5 text-muted-foreground">{exception.body}</p>
          </div>
        </div>
      )}

      <TrackingDetails order={order} timeline={timeline} onRefresh={onRefresh} refreshing={refreshing} />
    </div>
  );
}

function ProgressBar({ timeline, severe }: { timeline: Timeline; severe: boolean }) {
  return (
    <>
      {/* Tablet & desktop: horizontal */}
      <ol className="hidden grid-cols-4 sm:grid" aria-label="Order progress">
        {timeline.stages.map((s, i) => (
          <li key={s.stage} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[22px] right-1/2 h-px -translate-y-1/2 transition-colors duration-700",
                  s.state === "upcoming" ? "bg-border" : DONE_LINE,
                )}
                style={{ marginRight: "22px", width: "calc(100% - 44px)" }}
              />
            )}
            <StageIcon view={s} severe={severe} />
            <StageText view={s} className="mt-3" />
          </li>
        ))}
      </ol>

      {/* Mobile: vertical */}
      <ol className="space-y-0 sm:hidden" aria-label="Order progress">
        {timeline.stages.map((s, i) => {
          const next = timeline.stages[i + 1];
          return (
            <li key={s.stage} className="relative flex gap-4 pb-6 last:pb-0">
              {next && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-11 bottom-0 left-[21px] w-px transition-colors duration-700",
                    next.state === "upcoming" ? "bg-border" : DONE_LINE,
                  )}
                />
              )}
              <StageIcon view={s} severe={severe} />
              <StageText view={s} className="pt-2.5 text-left" />
            </li>
          );
        })}
      </ol>
    </>
  );
}

function StageIcon({ view, severe }: { view: StageView; severe: boolean }) {
  const Icon = ICONS[view.stage];
  return (
    <span
      className={cn(
        "relative z-10 grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-700",
        view.state === "complete" && DONE,
        view.state === "current" &&
          (severe
            ? "border-destructive bg-background text-destructive ring-4 ring-destructive/10"
            : "border-primary bg-primary text-primary-foreground ring-4 ring-primary/10"),
        view.state === "upcoming" && "border-border bg-background text-muted-foreground/60",
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.5} />
    </span>
  );
}

function StageText({ view, className }: { view: StageView; className?: string }) {
  return (
    <div className={className}>
      <p
        className={cn(
          "text-[0.68rem] tracking-[0.18em] uppercase",
          view.state === "upcoming" ? "text-muted-foreground/70" : "text-foreground",
          view.state === "current" && "font-medium",
        )}
      >
        {STAGE_LABELS[view.stage]}
      </p>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">
        {view.state === "upcoming" ? "" : (formatStamp(view.at) ?? (view.state === "current" ? "In progress" : ""))}
      </p>
    </div>
  );
}

function TrackingDetails({
  order,
  timeline,
  onRefresh,
  refreshing,
}: {
  order: TrackerOrder;
  timeline: Timeline;
  onRefresh?: (() => void) | undefined;
  refreshing?: boolean | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const events = timeline.tracking?.events ?? [];
  const latest = events[0];
  const visible = showAll ? events : events.slice(0, 5);

  const rows: [string, string | null][] = [
    ["Order ID", order.order_number],
    ["AWB / Tracking no.", timeline.awb],
    ["Courier partner", timeline.courier],
    ["Order date", formatStamp(new Date(order.created_at), false)],
    ["Estimated delivery", formatStamp(timeline.etd, false)],
    ["Current status", timeline.currentStatus],
    [
      "Latest update",
      latest
        ? [latest.activity ?? latest.status, latest.location, formatStamp(latest.at)]
            .filter(Boolean)
            .join(" · ")
        : null,
    ],
  ];

  return (
    <div className="mt-8 border-t border-border pt-6">
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 sm:block">
              <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
              <dd className="text-right sm:mt-1 sm:text-left">{value}</dd>
            </div>
          ))}
      </dl>

      {!order.shiprocket_order_id && (
        <p className="mt-4 text-sm text-muted-foreground">
          Tracking details will appear here once your order is handed to our courier partner.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        {timeline.trackUrl && timeline.awb && (
          <a
            href={timeline.trackUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 border border-foreground px-5 text-xs tracking-[0.16em] uppercase transition-colors hover:bg-foreground hover:text-background"
          >
            Track Shipment <ExternalLink className="size-3.5" />
          </a>
        )}
        {onRefresh && order.shiprocket_order_id && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-xs tracking-[0.16em] uppercase underline-offset-4 hover:underline disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh from Shiprocket
          </button>
        )}
        {order.tracking_synced_at && (
          <span className="text-xs text-muted-foreground">
            Updated {formatStamp(new Date(order.tracking_synced_at))}
          </span>
        )}
      </div>

      {events.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow">Shipment history</p>
          <ol className="mt-4 border-l border-border">
            {visible.map((e, i) => (
              <li key={`${e.rawDate}-${i}`} className="relative pb-5 pl-5 last:pb-0">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[4.5px] size-2 rounded-full",
                    i === 0 ? "bg-primary" : "bg-border",
                  )}
                />
                <p className="text-sm">{e.activity ?? e.status}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[formatStamp(e.at) ?? e.rawDate, e.location, e.activity && e.status !== e.activity ? e.status : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ol>
          {events.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 text-xs tracking-[0.16em] uppercase underline underline-offset-4 hover:text-accent"
            >
              {showAll ? "Show less" : `Show all ${events.length} updates`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
