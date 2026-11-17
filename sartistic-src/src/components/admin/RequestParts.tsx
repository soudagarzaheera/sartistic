import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/admin/ui";
import { formatPrice, titleCase } from "@/lib/format";
import { saveRequestRemarks } from "@/lib/returns.functions";
import { formatIstDateTime } from "@/lib/returns";

/** Fields every admin request row carries (see listReturnRequests / listRefundRequests). */
export type RequestBase = {
  id: string;
  quantity: number;
  reason: string;
  details: string | null;
  images: string[];
  status: string;
  delivered_at: string;
  window_ends_at: string;
  customer_message: string | null;
  admin_remarks: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  orders: {
    order_number: string;
    status: string;
    payment_method: string;
    payment_status: string;
    total: number;
    shipping_name: string;
    shipping_email: string | null;
    shipping_phone: string;
    shipping_address: string;
    shipping_city: string;
    shipping_state: string;
    shipping_postal_code: string;
    delivered_at: string | null;
    shiprocket_awb: string | null;
    razorpay_payment_id: string | null;
    created_at: string;
  } | null;
  order_items: {
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    image_url: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  } | null;
};

export function ist(value: string | null | undefined) {
  return value ? `${formatIstDateTime(value)} IST` : "—";
}

export function matchesSearch(r: RequestBase, term: string) {
  if (!term) return true;
  const o = r.orders;
  return `${o?.order_number ?? ""} ${o?.shipping_name ?? ""} ${o?.shipping_email ?? ""} ${o?.shipping_phone ?? ""} ${r.order_items?.product_name ?? ""}`
    .toLowerCase()
    .includes(term);
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function RequestPanel({ r }: { r: RequestBase }) {
  const item = r.order_items;
  return (
    <Panel title="Request">
      {item && (
        <div className="mb-4 flex items-center gap-3 text-sm">
          {item.image_url ? (
            <img src={item.image_url} alt="" className="size-12 object-cover" />
          ) : (
            <span className="size-12 bg-secondary" />
          )}
          <div>
            <p>
              {item.product_name}
              {item.variant_name && (
                <span className="text-muted-foreground"> · {item.variant_name}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.sku ?? "—"} · {formatPrice(item.unit_price)} × {item.quantity} ordered
            </p>
          </div>
        </div>
      )}
      <dl>
        <KV label="Quantity">{r.quantity}</KV>
        <KV label="Reason">{r.reason}</KV>
      </dl>
      {r.details && (
        <p className="mt-3 border-l-2 border-border pl-3 text-sm whitespace-pre-wrap">
          {r.details}
        </p>
      )}
      <p className="eyebrow mt-5 mb-2">Photos</p>
      {r.images.length ? (
        <div className="flex flex-wrap gap-2">
          {r.images.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" title={`Photo ${i + 1}`}>
              <img
                src={url}
                alt={`Customer photo ${i + 1}`}
                className="size-20 object-cover hover:opacity-80"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No photos attached.</p>
      )}
    </Panel>
  );
}

export function TimelinePanel({ r, extra }: { r: RequestBase; extra?: ReactNode }) {
  const requestedInWindow = new Date(r.created_at) < new Date(r.window_ends_at);
  return (
    <Panel title="Timestamps">
      <dl>
        <KV label="Order placed">{ist(r.orders?.created_at)}</KV>
        <KV label="Delivered (Shiprocket)">{ist(r.delivered_at)}</KV>
        <KV label="Window closed">
          {ist(new Date(new Date(r.window_ends_at).getTime() - 1).toISOString())}
        </KV>
        <KV label="Requested">
          {ist(r.created_at)}
          {!requestedInWindow && (
            <span className="block text-xs text-destructive">after window</span>
          )}
        </KV>
        {r.reviewed_at && <KV label="Reviewed">{ist(r.reviewed_at)}</KV>}
        {extra}
        <KV label="Last updated">{ist(r.updated_at)}</KV>
      </dl>
    </Panel>
  );
}

export function CustomerPanel({ r }: { r: RequestBase }) {
  const o = r.orders;
  if (!o) return null;
  return (
    <Panel title="Order & customer">
      <dl>
        <KV label="Order">
          <Link
            to="/admin/orders"
            search={{ q: o.order_number }}
            className="underline underline-offset-4"
          >
            {o.order_number}
          </Link>
        </KV>
        <KV label="Order status">{titleCase(o.status)}</KV>
        <KV label="Payment">
          {o.payment_method === "cod" ? "Cash on Delivery" : "Online (Razorpay)"} ·{" "}
          {titleCase(o.payment_status)}
        </KV>
        <KV label="Order total">{formatPrice(o.total)}</KV>
        {o.shiprocket_awb && <KV label="AWB">{o.shiprocket_awb}</KV>}
      </dl>
      <p className="mt-4 text-sm">
        {o.shipping_name}
        {o.shipping_email && (
          <>
            <br />
            <a className="underline underline-offset-4" href={`mailto:${o.shipping_email}`}>
              {o.shipping_email}
            </a>
          </>
        )}
        <br />
        <a className="underline underline-offset-4" href={`tel:${o.shipping_phone}`}>
          {o.shipping_phone}
        </a>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {o.shipping_address}, {o.shipping_city}, {o.shipping_state} {o.shipping_postal_code}
      </p>
    </Panel>
  );
}

export function RemarksPanel({
  kind,
  r,
  onSaved,
}: {
  kind: "return" | "refund";
  r: RequestBase;
  onSaved: () => void;
}) {
  const save = useServerFn(saveRequestRemarks);
  const [value, setValue] = useState(r.admin_remarks ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = value.trim() !== (r.admin_remarks ?? "");

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { kind, id: r.id, remarks: value } });
      toast.success("Remarks saved");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save remarks");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Internal remarks">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Visible to admins only"
        className="rounded-none"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 rounded-none"
        disabled={!dirty || busy}
        onClick={() => void submit()}
      >
        {busy ? "Saving…" : "Save remarks"}
      </Button>
    </Panel>
  );
}
