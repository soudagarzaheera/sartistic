import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice, ORDER_STATUSES, PAYMENT_STATUSES, titleCase } from "@/lib/format";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
});

function AdminOrders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function update(id: string, patch: { status?: string; payment_status?: string }) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) toast.error("Couldn't update order");
    else {
      toast.success("Order updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    }
  }

  const list = (orders.data ?? []).filter(
    (o) =>
      (!status || o.status === status) &&
      `${o.order_number} ${o.shipping_name} ${o.shipping_email ?? ""} ${o.shipping_phone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl">Orders</h1>
        <div className="flex gap-2">
          <Input placeholder="Search order, name, email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 rounded-none" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border bg-background px-3 text-sm">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {orders.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!orders.isLoading && list.length === 0 && <p className="text-muted-foreground">No orders found.</p>}
        {list.map((o) => (
          <div key={o.id} className="border border-border bg-background">
            <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left text-sm">
              <span className="font-medium">{o.order_number}</span>
              <span className="text-muted-foreground">{o.shipping_name}</span>
              <span>{formatDate(o.created_at)}</span>
              <span>{formatPrice(o.total)}</span>
              <span className="text-xs tracking-[0.14em] uppercase">{titleCase(o.status)} · {titleCase(o.payment_status)}</span>
            </button>
            {open === o.id && (
              <div className="grid gap-6 border-t border-border p-5 text-sm md:grid-cols-3">
                <div>
                  <p className="eyebrow">Items</p>
                  <ul className="mt-2 space-y-1">
                    {o.order_items?.map((i) => (
                      <li key={i.id}>{i.product_name}{i.variant_name ? ` (${i.variant_name})` : ""} × {i.quantity} — {formatPrice(i.total_price)}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-muted-foreground">Subtotal {formatPrice(o.subtotal)} · Discount {formatPrice(o.discount)} · Shipping {formatPrice(o.shipping_fee)}</p>
                  {o.coupon_code && <p className="text-muted-foreground">Coupon: {o.coupon_code}</p>}
                </div>
                <div>
                  <p className="eyebrow">Customer &amp; shipping</p>
                  <p className="mt-2">{o.shipping_name}<br />{o.shipping_email}<br />{o.shipping_phone}</p>
                  <p className="mt-2 text-muted-foreground">{o.shipping_address}, {o.shipping_city}, {o.shipping_state} {o.shipping_postal_code}</p>
                  {o.razorpay_payment_id && <p className="mt-2 text-xs text-muted-foreground">Payment ref: {o.razorpay_payment_id}</p>}
                </div>
                <div className="space-y-3">
                  <p className="eyebrow">Update</p>
                  <select value={o.status} onChange={(e) => void update(o.id, { status: e.target.value })} className="w-full border border-border bg-background p-2">
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </select>
                  <select value={o.payment_status} onChange={(e) => void update(o.id, { payment_status: e.target.value })} className="w-full border border-border bg-background p-2">
                    {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>Payment: {titleCase(s)}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">Created {formatDate(o.created_at)} · Last updated {formatDate(o.updated_at)}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
