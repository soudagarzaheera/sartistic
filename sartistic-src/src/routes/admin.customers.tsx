import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice, titleCase } from "@/lib/format";
import { PageHeader, StatusPill } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/customers")({
  component: AdminCustomers,
});

type CustomerOrder = {
  id: string;
  order_number: string;
  user_id: string;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
  shipping_phone: string;
  shipping_city: string;
  shipping_state: string;
};

function AdminCustomers() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Profiles hold only name/email/phone — no passwords or auth secrets.
  const data = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: async () => {
      const [profiles, orders, admins] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email, phone, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select(
            "id, order_number, user_id, total, status, payment_status, created_at, shipping_phone, shipping_city, shipping_state",
          )
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      if (profiles.error) throw profiles.error;
      const adminIds = new Set((admins.data ?? []).map((a) => a.user_id));
      const allOrders = (orders.data ?? []) as CustomerOrder[];
      return (profiles.data ?? []).map((p) => {
        const mine = allOrders.filter((o) => o.user_id === p.user_id);
        const paid = mine.filter((o) => o.payment_status === "paid");
        return {
          ...p,
          isAdmin: adminIds.has(p.user_id),
          orders: mine,
          spent: paid.reduce((s, o) => s + Number(o.total), 0),
          last: mine[0]?.created_at ?? null,
          phone: p.phone ?? mine[0]?.shipping_phone ?? null,
          location: mine[0] ? `${mine[0].shipping_city}, ${mine[0].shipping_state}` : null,
        };
      });
    },
  });

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data.data ?? []).filter((c) =>
      `${c.full_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(term),
    );
  }, [data.data, search]);
  const current = data.data?.find((c) => c.user_id === selected) ?? null;

  return (
    <div>
      <PageHeader title="Customers" description="Registered accounts and their order history." />
      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-none pl-9"
        />
      </div>

      <div className="mt-4 overflow-x-auto border border-border bg-background">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-left text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">
            <tr>
              <th className="p-3 font-normal">Customer</th>
              <th className="p-3 font-normal">Phone</th>
              <th className="p-3 font-normal">Orders</th>
              <th className="p-3 font-normal">Paid total</th>
              <th className="p-3 font-normal">Last order</th>
              <th className="p-3 font-normal">Joined</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr
                key={c.user_id}
                onClick={() => setSelected(c.user_id)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/40"
              >
                <td className="p-3">
                  <p className="font-medium">
                    {c.full_name || "—"} {c.isAdmin && <StatusPill>Admin</StatusPill>}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </td>
                <td className="p-3">{c.phone ?? "—"}</td>
                <td className="p-3">{c.orders.length}</td>
                <td className="p-3">{formatPrice(c.spent)}</td>
                <td className="p-3">{formatDate(c.last)}</td>
                <td className="p-3">{formatDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading customers…</p>}
        {data.isError && <p className="p-6 text-sm text-destructive">Couldn't load customers.</p>}
        {!data.isLoading && list.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No customers found.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{list.length} customers</p>

      <Sheet open={Boolean(current)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {current && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-3xl font-normal">
                  {current.full_name || current.email}
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-6 space-y-3 text-sm">
                <Item
                  label="Email"
                  value={
                    current.email ? (
                      <a className="underline" href={`mailto:${current.email}`}>
                        {current.email}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Item
                  label="Phone"
                  value={
                    current.phone ? (
                      <a className="underline" href={`tel:${current.phone}`}>
                        {current.phone}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Item label="Last shipping city" value={current.location ?? "—"} />
                <Item label="Customer since" value={formatDate(current.created_at)} />
                <Item label="Paid total" value={formatPrice(current.spent)} />
              </dl>
              <p className="eyebrow mt-8">Order history ({current.orders.length})</p>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {current.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to="/admin/orders"
                      search={{ q: o.order_number }}
                      className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-secondary/40"
                    >
                      <span>
                        <span className="block font-medium">{o.order_number}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(o.created_at)}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block">{formatPrice(o.total)}</span>
                        <span className="text-xs text-muted-foreground">
                          {titleCase(o.payment_status)} · {titleCase(o.status)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {current.orders.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">No orders yet.</li>
                )}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
