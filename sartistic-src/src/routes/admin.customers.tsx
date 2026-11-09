import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice } from "@/lib/format";

export const Route = createFileRoute("/admin/customers")({
  component: AdminCustomers,
});

function AdminCustomers() {
  const [search, setSearch] = useState("");
  const data = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: async () => {
      const [profiles, orders] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email, phone, created_at"),
        supabase.from("orders").select("user_id, total, payment_status, created_at"),
      ]);
      return (profiles.data ?? []).map((p) => {
        const mine = (orders.data ?? []).filter((o) => o.user_id === p.user_id);
        const paid = mine.filter((o) => o.payment_status === "paid");
        return {
          ...p,
          orders: mine.length,
          spent: paid.reduce((s, o) => s + Number(o.total), 0),
          last: mine.map((o) => o.created_at).sort().at(-1) ?? null,
        };
      });
    },
  });

  const list = (data.data ?? []).filter((c) =>
    `${c.full_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-4xl">Customers</h1>
        <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-none" />
      </div>
      <div className="mt-8 overflow-x-auto border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs tracking-[0.14em] text-muted-foreground uppercase">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Phone</th><th className="p-3">Orders</th><th className="p-3">Spent</th><th className="p-3">Last order</th><th className="p-3">Joined</th></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.user_id} className="border-b border-border last:border-0">
                <td className="p-3">{c.full_name ?? "—"}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3">{c.phone ?? "—"}</td>
                <td className="p-3">{c.orders}</td>
                <td className="p-3">{formatPrice(c.spent)}</td>
                <td className="p-3">{formatDate(c.last)}</td>
                <td className="p-3">{formatDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.isLoading && <p className="p-6 text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}
