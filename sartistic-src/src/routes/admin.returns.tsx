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
import { listReturnRequests, updateReturnStatus } from "@/lib/returns.functions";
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUSES,
  RETURN_TRANSITIONS,
  type ReturnStatus,
} from "@/lib/returns";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/returns")({
  component: AdminReturns,
});

type ReturnRow = Awaited<ReturnType<typeof listReturnRequests>>[number];

function returnTone(s: string) {
  return s === "returned"
    ? "good"
    : s === "rejected"
      ? "bad"
      : s === "requested"
        ? "warn"
        : "neutral";
}

function AdminReturns() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listReturnRequests);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const requests = useQuery({ queryKey: ["admin", "returns"], queryFn: () => fetchList() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests.data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests.data]);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (requests.data ?? []).filter(
      (r) => (!status || r.status === status) && matchesSearch(r, term),
    );
  }, [requests.data, search, status]);

  return (
    <div>
      <PageHeader
        title="Return Requests"
        description="Customers can request a return within 3 days of the Shiprocket delivery date. Nothing is approved automatically — review each request here."
      />

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {RETURN_STATUSES.map((s) => (
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
            {RETURN_STATUS_LABELS[s]} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Order no., customer, email, phone or product"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-none pl-9"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          {RETURN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RETURN_STATUS_LABELS[s]}
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
          <p className="text-sm text-muted-foreground">No return requests.</p>
        )}
        {list.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="border border-border bg-background">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="grid w-full grid-cols-2 items-center gap-x-4 gap-y-2 p-4 text-left text-sm md:grid-cols-[1fr_1.6fr_1.2fr_0.8fr_auto_auto]"
              >
                <span className="font-medium">{r.orders?.order_number}</span>
                <span className="truncate">
                  {r.order_items?.product_name}
                  <span className="text-muted-foreground"> × {r.quantity}</span>
                </span>
                <span className="truncate text-muted-foreground">{r.orders?.shipping_name}</span>
                <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                <StatusPill tone={returnTone(r.status)}>
                  {RETURN_STATUS_LABELS[r.status as ReturnStatus] ?? r.status}
                </StatusPill>
                <ChevronDown
                  className={cn(
                    "hidden size-4 transition-transform md:block",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && <ReturnDetail r={r} onChanged={refresh} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReturnDetail({ r, onChanged }: { r: ReturnRow; onChanged: () => void }) {
  const update = useServerFn(updateReturnStatus);
  const [confirm, confirmDialog] = useConfirm();
  const [message, setMessage] = useState(r.customer_message ?? "");
  const [busy, setBusy] = useState(false);
  const next = RETURN_TRANSITIONS[r.status as ReturnStatus] ?? [];

  async function move(to: ReturnStatus) {
    if (to === "rejected" && !message.trim()) {
      toast.error("Add a message for the customer explaining the rejection.");
      return;
    }
    const ok = await confirm({
      title: `Mark this return as “${RETURN_STATUS_LABELS[to]}”?`,
      description:
        to === "approved"
          ? "Arrange the pickup with the courier once approved. Approving a return doesn't issue a refund."
          : to === "rejected"
            ? "The customer will see this as rejected, with your message."
            : "",
      confirmLabel: RETURN_STATUS_LABELS[to],
      destructive: to === "rejected",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await update({
        data: {
          id: r.id,
          from: r.status as ReturnStatus,
          to,
          customerMessage: message.trim() || undefined,
        },
      });
      toast.success(`Return → ${RETURN_STATUS_LABELS[to]}`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the return");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 border-t border-border p-4 md:p-5 lg:grid-cols-3">
      {confirmDialog}
      <RequestPanel r={r} />
      <div className="space-y-4">
        <Panel title="Status">
          <StatusPill tone={returnTone(r.status)}>
            {RETURN_STATUS_LABELS[r.status as ReturnStatus] ?? r.status}
          </StatusPill>
          {next.length > 0 ? (
            <>
              <label className="mt-4 block text-xs text-muted-foreground">
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
              <div className="mt-3 flex flex-wrap gap-2">
                {next.map((to) => (
                  <Button
                    key={to}
                    type="button"
                    size="sm"
                    variant={to === "rejected" ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => void move(to)}
                    className={cn("rounded-none", to === "rejected" && "text-destructive")}
                  >
                    {to === "approved"
                      ? "Approve"
                      : to === "rejected"
                        ? "Reject"
                        : `Mark ${RETURN_STATUS_LABELS[to]}`}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">This request is closed.</p>
          )}
          {r.customer_message && (
            <p className="mt-3 text-xs text-muted-foreground">
              Customer sees: “{r.customer_message}”
            </p>
          )}
        </Panel>
        <RemarksPanel kind="return" r={r} onSaved={onChanged} />
      </div>
      <div className="space-y-4">
        <TimelinePanel
          r={r}
          extra={
            <>
              {r.picked_up_at && <KV label="Picked up">{ist(r.picked_up_at)}</KV>}
              {r.returned_at && <KV label="Returned">{ist(r.returned_at)}</KV>}
            </>
          }
        />
        <CustomerPanel r={r} />
      </div>
    </div>
  );
}
