import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { formatPrice } from "@/lib/format";
import { createRefundRequest, createReturnRequest } from "@/lib/returns.functions";
import {
  EVIDENCE_BUCKET,
  formatIstDateTime,
  formatRemaining,
  itemRefundAmount,
  MAX_EVIDENCE_IMAGES,
  REFUND_REASONS,
  REFUND_STATUS_LABELS,
  refundProblem,
  requestWindow,
  RETURN_REASONS,
  RETURN_STATUS_LABELS,
  windowProblem,
  type RefundStatus,
  type ReturnStatus,
} from "@/lib/returns";
import { ACCEPT_ATTR, extensionFor, optimizeImage, validateImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Order = Tables<"orders"> & { order_items: Tables<"order_items">[] };
type Kind = "return" | "refund";

// Customers can read only these columns (internal admin remarks are excluded).
const RETURN_COLUMNS = "id, order_item_id, quantity, reason, status, customer_message, created_at";
const REFUND_COLUMNS =
  "id, order_item_id, quantity, reason, status, customer_message, requested_amount, approved_amount, refunded_at, created_at";

/** Re-renders every 30 s so the countdown and the cut-off stay current. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function tone(status: string) {
  if (["approved", "returned", "refunded", "picked_up"].includes(status)) return "good";
  if (status === "rejected") return "bad";
  return "neutral";
}

function Pill({ status, label }: { status: string; label: string }) {
  const t = tone(status);
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 text-[0.65rem] tracking-[0.14em] whitespace-nowrap uppercase",
        t === "good" && "border-[#5E7D61]/40 bg-[#5E7D61]/10 text-[#3f5a42] dark:text-[#a9c7ab]",
        t === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
        t === "neutral" && "border-border bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export function ReturnsRefunds({ order }: { order: Order }) {
  const now = useNow();
  const [form, setForm] = useState<{ kind: Kind; item: Tables<"order_items"> } | null>(null);

  const requests = useQuery({
    queryKey: ["order-requests", order.id],
    queryFn: async () => {
      const [returns, refunds] = await Promise.all([
        supabase.from("return_requests").select(RETURN_COLUMNS).eq("order_id", order.id),
        supabase.from("refund_requests").select(REFUND_COLUMNS).eq("order_id", order.id),
      ]);
      if (returns.error) throw returns.error;
      if (refunds.error) throw refunds.error;
      return { returns: returns.data ?? [], refunds: refunds.data ?? [] };
    },
  });

  const win = requestWindow(order, now);
  const returnIssue = windowProblem(win);
  const refundIssue = refundProblem(order, win);
  const open = win.state === "open";
  const hasRequests = Boolean(requests.data?.returns.length || requests.data?.refunds.length);

  // Nothing to show before delivery unless requests already exist.
  if (win.state === "not_delivered" && !hasRequests) {
    return (
      <div className="mt-10 border border-border px-5 py-6 sm:px-8">
        <p className="eyebrow">Returns &amp; refunds</p>
        <p className="mt-3 text-sm text-muted-foreground">{returnIssue}</p>
        <PolicyLinks />
      </div>
    );
  }

  return (
    <div className="mt-10 border border-border px-5 py-8 sm:px-8">
      <p className="eyebrow">Returns &amp; refunds</p>

      <dl className="mt-6 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Delivered"
          value={
            "deliveredAt" in win ? `${formatIstDateTime(win.deliveredAt)} IST` : "Not available"
          }
        />
        <Fact
          label="Return eligibility"
          value={returnIssue ? "Not eligible" : "Eligible"}
          ok={!returnIssue}
        />
        <Fact
          label="Refund eligibility"
          value={refundIssue ? "Not eligible" : "Eligible"}
          ok={!refundIssue}
        />
        <Fact
          label="Time remaining"
          value={
            win.state === "open"
              ? `${formatRemaining(win.remainingMs)}`
              : win.state === "expired"
                ? "Window closed"
                : "—"
          }
          hint={
            "endsAt" in win
              ? `${open ? "Until" : "Closed"} ${formatIstDateTime(new Date(win.endsAt.getTime() - 1))} IST`
              : undefined
          }
        />
      </dl>

      {returnIssue && (
        <p
          role="status"
          className={cn(
            "mt-6 border-l-2 pl-4 text-sm",
            win.state === "expired" ? "border-destructive" : "border-border text-muted-foreground",
          )}
        >
          {returnIssue}
        </p>
      )}
      {!returnIssue && refundIssue && (
        <p className="mt-6 border-l-2 border-border pl-4 text-sm text-muted-foreground">
          Refunds: {refundIssue}
        </p>
      )}

      <ul className="mt-8 divide-y divide-border border-y border-border">
        {order.order_items.map((item) => {
          const ret = requests.data?.returns.find((r) => r.order_item_id === item.id);
          const ref = requests.data?.refunds.find((r) => r.order_item_id === item.id);
          return (
            <li key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
              <div className="flex flex-1 items-center gap-3 text-sm">
                {item.image_url && (
                  <img src={item.image_url} alt="" className="size-12 bg-secondary object-cover" />
                )}
                <div>
                  <p>{item.product_name}</p>
                  <p className="text-muted-foreground">
                    {item.variant_name ? `${item.variant_name} · ` : ""}Qty {item.quantity}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 text-sm sm:w-72">
                <RequestRow
                  kind="return"
                  request={ret}
                  label={ret && RETURN_STATUS_LABELS[ret.status as ReturnStatus]}
                  canRequest={!returnIssue && !requests.isLoading}
                  onRequest={() => setForm({ kind: "return", item })}
                />
                <RequestRow
                  kind="refund"
                  request={ref}
                  label={ref && REFUND_STATUS_LABELS[ref.status as RefundStatus]}
                  extra={
                    ref?.status === "refunded" && ref.approved_amount
                      ? `${formatPrice(ref.approved_amount)} refunded to your original payment method`
                      : undefined
                  }
                  canRequest={!refundIssue && !requests.isLoading}
                  onRequest={() => setForm({ kind: "refund", item })}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <PolicyLinks />

      {form && (
        <RequestDialog
          kind={form.kind}
          order={order}
          item={form.item}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  ok,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  ok?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-1", ok === true && "text-[#3f5a42] dark:text-[#a9c7ab]")}>{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function RequestRow({
  kind,
  request,
  label,
  extra,
  canRequest,
  onRequest,
}: {
  kind: Kind;
  request: { status: string; customer_message: string | null } | undefined;
  label: string | undefined;
  extra?: string | undefined;
  canRequest: boolean;
  onRequest: () => void;
}) {
  const name = kind === "return" ? "Return" : "Refund";
  if (request) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{name}</span>
          <Pill status={request.status} label={label ?? request.status} />
        </div>
        {extra && <p className="mt-1 text-xs text-muted-foreground">{extra}</p>}
        {request.customer_message && (
          <p className="mt-1 text-xs text-muted-foreground">“{request.customer_message}”</p>
        )}
      </div>
    );
  }
  if (!canRequest) return null;
  return (
    <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={onRequest}>
      Request {kind}
    </Button>
  );
}

function PolicyLinks() {
  return (
    <p className="mt-6 text-xs text-muted-foreground">
      Read our{" "}
      <Link to="/return-policy" className="underline underline-offset-4 hover:text-accent">
        Return Policy
      </Link>{" "}
      and{" "}
      <Link to="/refund-policy" className="underline underline-offset-4 hover:text-accent">
        Refund Policy
      </Link>
      .
    </p>
  );
}

type Photo = { path: string; preview: string };

function RequestDialog({
  kind,
  order,
  item,
  onClose,
}: {
  kind: Kind;
  order: Order;
  item: Tables<"order_items">;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const submitReturn = useServerFn(createReturnRequest);
  const submitRefund = useServerFn(createRefundRequest);
  const reasons = kind === "return" ? RETURN_REASONS : REFUND_REASONS;

  const [quantity, setQuantity] = useState(item.quantity);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Free the local previews when the dialog closes.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !user) return;
    const room = MAX_EVIDENCE_IMAGES - photos.length;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(`You can attach up to ${MAX_EVIDENCE_IMAGES} photos.`);
    setUploading(true);
    try {
      for (const original of chosen) {
        const problem = validateImage(original);
        if (problem) {
          toast.error(problem);
          continue;
        }
        const file = await optimizeImage(original);
        const path = `${user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
        const { error } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          toast.error(`Couldn't upload ${original.name}. Please try again.`);
          continue;
        }
        const preview = URL.createObjectURL(file);
        previews.current.push(preview);
        setPhotos((prev) => [...prev, { path, preview }]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      toast.error("Please choose a reason.");
      return;
    }
    if (reason === "Other" && !details.trim()) {
      toast.error("Please tell us a little more.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        orderId: order.id,
        orderItemId: item.id,
        quantity,
        details: details.trim(),
        imagePaths: photos.map((p) => p.path),
      };
      // The server re-validates everything, including the reason and the window.
      if (kind === "return") {
        await submitReturn({
          data: { ...payload, reason: reason as (typeof RETURN_REASONS)[number] },
        });
      } else {
        await submitRefund({
          data: { ...payload, reason: reason as (typeof REFUND_REASONS)[number] },
        });
      }
      toast.success(
        kind === "return"
          ? "Return requested. We'll review it and get back to you."
          : "Refund requested. We'll review it and get back to you.",
      );
      void queryClient.invalidateQueries({ queryKey: ["order-requests", order.id] });
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
      void queryClient.invalidateQueries({ queryKey: ["order-requests", order.id] });
    } finally {
      setBusy(false);
    }
  }

  const estimate = itemRefundAmount(item, order, quantity);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Request a {kind}</DialogTitle>
          <DialogDescription>
            {item.product_name}
            {item.variant_name ? ` · ${item.variant_name}` : ""} — order {order.order_number}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5 text-sm">
          {item.quantity > 1 && (
            <label className="block">
              <span className="text-muted-foreground">Quantity</span>
              <select
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="mt-1 h-10 w-full border border-input bg-background px-3"
              >
                {Array.from({ length: item.quantity }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-muted-foreground">Reason</span>
            <select
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-10 w-full border border-input bg-background px-3"
            >
              <option value="">Choose a reason</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-muted-foreground">
              Details {reason === "Other" ? "" : "(optional)"}
            </span>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Tell us what happened"
              className="mt-1 rounded-none"
            />
          </label>

          <div>
            <p className="text-muted-foreground">
              Photos (optional, up to {MAX_EVIDENCE_IMAGES}) — they help us resolve this faster
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.path} className="relative">
                  <img src={p.preview} alt="" className="size-20 object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPhotos((prev) => prev.filter((x) => x.path !== p.path))}
                    className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-foreground text-background"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_EVIDENCE_IMAGES && (
                <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-border text-xs text-muted-foreground hover:border-accent">
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                  {uploading ? "Uploading" : "Add"}
                  <input
                    type="file"
                    accept={ACCEPT_ATTR}
                    multiple
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      void addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {kind === "refund" && (
            <p className="text-xs text-muted-foreground">
              Estimated refund: {formatPrice(estimate)}. The final amount is confirmed after review
              and is returned to your original payment method
              {order.payment_method === "cod"
                ? " (for Cash on Delivery, we'll contact you to arrange a bank or UPI transfer)"
                : ""}
              .
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Requests are reviewed by our team — submitting one doesn't approve it automatically.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-none" disabled={busy || uploading}>
              {busy ? "Submitting…" : `Submit ${kind} request`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
