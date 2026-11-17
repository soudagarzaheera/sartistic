import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel, StatusPill, selectClass, useConfirm } from "@/components/admin/ui";
import {
  CustomerPanel,
  ist,
  KV,
  matchesSearch,
  RemarksPanel,
  RequestPanel,
  TimelinePanel,
} from "@/components/admin/RequestParts";
import {
  checkRefundWithGateway,
  issueRefund,
  listRefundRequests,
  updateRefundStatus,
} from "@/lib/returns.functions";
import {
  REFUND_STATUS_LABELS,
  REFUND_STATUSES,
  RETURN_STATUS_LABELS,
  refundTransitions,
  type RefundStatus,
  type ReturnStatus,
} from "@/lib/returns";
import { formatDate, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/refunds")({
  component: AdminRefunds,
});

type RefundRow = Awaited<ReturnType<typeof listRefundRequests>>[number];

function refundTone(s: string) {
  return s === "refunded"
    ? "good"
    : s === "rejected"
      ? "bad"
      : s === "requested" || s === "under_review"
        ? "warn"
        : "neutral";
}

function AdminRefunds() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listRefundRequests);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const requests = useQuery({ queryKey: ["admin", "refunds"], queryFn: () => fetchList() });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "refunds"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests.data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests.data]);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (requests.data ?? []).filter(
      (r) =>
        (!status || r.status === status) &&
        (matchesSearch(r, term) ||
          `${r.gateway_refund_id ?? ""} ${r.refund_reference ?? ""} ${r.razorpay_payment_id ?? ""}`
            .toLowerCase()
            .includes(term)),
    );
  }, [requests.data, search, status]);

  return (
    <div>
      <PageHeader
        title="Refund Requests"
        description="Refunds are issued only after review. Online payments are refunded to the original method through Razorpay and marked Refunded only when Razorpay confirms; Cash on Delivery refunds are paid by bank/UPI and recorded with their reference."
      />

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {REFUND_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? "" : s)}
            className={cn(
              "border px-3 py-1.5",
              status === s
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background",
            )}
          >
            {REFUND_STATUS_LABELS[s]} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Order no., customer, product, payment or refund ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-none pl-9"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          {REFUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REFUND_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        {requests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {requests.isError && (
          <p className="text-sm text-destructive">
            {requests.error instanceof Error ? requests.error.message : "Couldn't load requests."}
          </p>
        )}
        {!requests.isLoading && !requests.isError && list.length === 0 && (
          <p className="text-sm text-muted-foreground">No refund requests.</p>
        )}
        {list.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="border border-border bg-background">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="grid w-full grid-cols-2 items-center gap-x-4 gap-y-2 p-4 text-left text-sm md:grid-cols-[1fr_1.5fr_1.1fr_0.8fr_0.8fr_auto_auto]"
              >
                <span className="font-medium">{r.orders?.order_number}</span>
                <span className="truncate">
                  {r.order_items?.product_name}
                  <span className="text-muted-foreground"> × {r.quantity}</span>
                </span>
                <span className="truncate text-muted-foreground">{r.orders?.shipping_name}</span>
                <span>{formatPrice(r.approved_amount ?? r.requested_amount)}</span>
                <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                <StatusPill tone={refundTone(r.status)}>
                  {REFUND_STATUS_LABELS[r.status as RefundStatus] ?? r.status}
                </StatusPill>
                <ChevronDown
                  className={cn(
                    "hidden size-4 transition-transform md:block",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && <RefundDetail r={r} onChanged={refresh} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RefundDetail({ r, onChanged }: { r: RefundRow; onChanged: () => void }) {
  const update = useServerFn(updateRefundStatus);
  const issue = useServerFn(issueRefund);
  const check = useServerFn(checkRefundWithGateway);
  const [confirm, confirmDialog] = useConfirm();
  const [message, setMessage] = useState(r.customer_message ?? "");
  const [amount, setAmount] = useState(String(r.approved_amount ?? r.requested_amount));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const status = r.status as RefundStatus;
  const isCod = r.payment_method === "cod";
  const next = refundTransitions(status, r.payment_method);
  const canIssue = !isCod && status === "approved";
  const canCheck = !isCod && (status === "processing" || Boolean(r.gateway_refund_id));

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  async function move(to: RefundStatus) {
    if (to === "rejected" && !message.trim()) {
      toast.error("Add a message for the customer explaining the rejection.");
      return;
    }
    const approvedAmount = Number(amount);
    if (to === "approved" && !(approvedAmount > 0)) {
      toast.error("Enter the amount to refund.");
      return;
    }
    if (to === "refunded" && reference.trim().length < 4) {
      toast.error("Enter the bank or UPI transaction reference.");
      return;
    }
    const ok = await confirm({
      title: `Mark this refund as “${REFUND_STATUS_LABELS[to]}”?`,
      description:
        to === "approved"
          ? `Approve a refund of ${formatPrice(approvedAmount)}. ${isCod ? "Pay it by bank/UPI, then record the reference." : "Then use “Issue refund via Razorpay” to send it."}`
          : to === "refunded"
            ? `Only confirm once ${formatPrice(r.approved_amount)} has actually been paid to the customer (reference ${reference.trim()}).`
            : to === "rejected"
              ? "The customer will see this as rejected, with your message."
              : "",
      confirmLabel: REFUND_STATUS_LABELS[to],
      destructive: to === "rejected",
    });
    if (!ok) return;
    await run(
      () =>
        update({
          data: {
            id: r.id,
            from: status,
            to,
            approvedAmount: to === "approved" ? approvedAmount : undefined,
            reference: to === "refunded" ? reference.trim() : undefined,
            customerMessage: message.trim() || undefined,
          },
        }),
      `Refund → ${REFUND_STATUS_LABELS[to]}`,
    );
  }

  async function issueViaRazorpay() {
    const ok = await confirm({
      title: `Refund ${formatPrice(r.approved_amount)} via Razorpay?`,
      description: `This sends the refund to the customer's original payment method (payment ${r.razorpay_payment_id}). It can't be undone.`,
      confirmLabel: "Issue refund",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await issue({ data: { id: r.id } });
      if (result.outcome === "failed") toast.error(result.message);
      else toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't issue the refund");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  async function checkGateway() {
    setBusy(true);
    try {
      const result = await check({ data: { id: r.id } });
      toast(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't check with Razorpay");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const linkedReturn = r.return_requests?.status as ReturnStatus | undefined;

  return (
    <div className="grid gap-4 border-t border-border p-4 md:p-5 lg:grid-cols-3">
      {confirmDialog}
      <div className="space-y-4">
        <RequestPanel r={r} />
        <Panel title="Payment transaction">
          <dl>
            <KV label="Method">{isCod ? "Cash on Delivery" : "Online (Razorpay)"}</KV>
            {r.razorpay_payment_id && (
              <KV label="Payment ID">
                <a
                  href={`https://dashboard.razorpay.com/app/payments/${r.razorpay_payment_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all underline underline-offset-4"
                >
                  {r.razorpay_payment_id}
                </a>
              </KV>
            )}
            <KV label="Requested amount">{formatPrice(r.requested_amount)}</KV>
            <KV label="Approved amount">
              {r.approved_amount ? formatPrice(r.approved_amount) : "—"}
            </KV>
            {r.gateway_refund_id && <KV label="Razorpay refund">{r.gateway_refund_id}</KV>}
            {r.gateway_status && <KV label="Gateway status">{r.gateway_status}</KV>}
            {r.refund_reference && <KV label="Reference">{r.refund_reference}</KV>}
            {linkedReturn && (
              <KV label="Linked return">{RETURN_STATUS_LABELS[linkedReturn] ?? linkedReturn}</KV>
            )}
          </dl>
          {r.failure_reason && (
            <p className="mt-3 border-l-2 border-destructive pl-3 text-xs text-destructive">
              {r.failure_reason}
            </p>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Status">
          <StatusPill tone={refundTone(status)}>
            {REFUND_STATUS_LABELS[status] ?? status}
          </StatusPill>

          {(next.length > 0 || canIssue || canCheck) && (
            <div className="mt-4 space-y-3">
              {next.includes("approved") && (
                <label className="block text-xs text-muted-foreground">
                  Amount to refund (₹)
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 h-9 rounded-none"
                  />
                </label>
              )}
              {next.includes("refunded") && (
                <label className="block text-xs text-muted-foreground">
                  Bank / UPI transaction reference
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={120}
                    className="mt-1 h-9 rounded-none"
                  />
                </label>
              )}
              {next.length > 0 && (
                <label className="block text-xs text-muted-foreground">
                  Message to customer{" "}
                  {next.includes("rejected") ? "(required to reject)" : "(optional)"}
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="mt-1 rounded-none"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {canIssue && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void issueViaRazorpay()}
                    className="rounded-none"
                  >
                    Issue refund via Razorpay
                  </Button>
                )}
                {next.map((to) => (
                  <Button
                    key={to}
                    type="button"
                    size="sm"
                    variant={to === "rejected" || canIssue ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => void move(to)}
                    className={cn("rounded-none", to === "rejected" && "text-destructive")}
                  >
                    {to === "approved"
                      ? "Approve"
                      : to === "rejected"
                        ? "Reject"
                        : to === "refunded"
                          ? "Record refund paid"
                          : `Mark ${REFUND_STATUS_LABELS[to]}`}
                  </Button>
                ))}
                {canCheck && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void checkGateway()}
                    className="rounded-none"
                  >
                    Check with Razorpay
                  </Button>
                )}
              </div>
            </div>
          )}
          {next.length === 0 && !canIssue && !canCheck && (
            <p className="mt-3 text-xs text-muted-foreground">This request is closed.</p>
          )}
          {r.customer_message && (
            <p className="mt-3 text-xs text-muted-foreground">
              Customer sees: “{r.customer_message}”
            </p>
          )}
        </Panel>
        <RemarksPanel kind="refund" r={r} onSaved={onChanged} />
      </div>

      <div className="space-y-4">
        <TimelinePanel
          r={r}
          extra={
            <>
              {r.processing_started_at && (
                <KV label="Processing since">{ist(r.processing_started_at)}</KV>
              )}
              {r.refunded_at && <KV label="Refunded">{ist(r.refunded_at)}</KV>}
            </>
          }
        />
        <CustomerPanel r={r} />
      </div>
    </div>
  );
}
