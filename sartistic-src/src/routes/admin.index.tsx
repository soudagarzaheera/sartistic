import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice, titleCase } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const stats = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => {
      const [orders, items, products, profiles] = await Promise.all([
        supabase.from("orders").select("id, total, status, payment_status, created_at"),
        supabase.from("order_items").select("product_name, quantity, total_price, order_id"),
        supabase.from("products").select("id, stock_quantity, low_stock_threshold"),
        supabase.from("profiles").select("created_at"),
      ]);
      return {
        orders: orders.data ?? [],
        items: items.data ?? [],
        products: products.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  if (stats.isLoading || !stats.data) {
    return <p className="text-muted-foreground">Loading dashboard…</p>;
  }

  const { orders, items, products, profiles } = stats.data;
  const paid = orders.filter((o) => o.payment_status === "paid");
  const paidIds = new Set(paid.map((o) => o.id));
  const today = new Date().toDateString();
  const totalSales = paid.reduce((s, o) => s + Number(o.total), 0);
  const todaySales = paid
    .filter((o) => new Date(o.created_at).toDateString() === today)
    .reduce((s, o) => s + Number(o.total), 0);

  const byDay = new Map<string, { day: string; sales: number; orders: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: key.slice(5), sales: 0, orders: 0 });
  }
  for (const o of orders) {
    const entry = byDay.get(o.created_at.slice(0, 10));
    if (!entry) continue;
    entry.orders += 1;
    if (o.payment_status === "paid") entry.sales += Number(o.total);
  }

  const productTotals = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const i of items) {
    if (!paidIds.has(i.order_id)) continue;
    const e = productTotals.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0 };
    e.qty += i.quantity;
    e.revenue += Number(i.total_price);
    productTotals.set(i.product_name, e);
  }
  const topProducts = [...productTotals.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);

  const statusCounts = Object.entries(
    orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name: titleCase(name), value }));

  const growth = new Map<string, number>();
  for (const p of profiles) {
    const m = p.created_at.slice(0, 7);
    growth.set(m, (growth.get(m) ?? 0) + 1);
  }
  let running = 0;
  const growthData = [...growth.entries()]
    .sort()
    .map(([month, n]) => ({ month, customers: (running += n) }));

  const kpis = [
    { label: "Total Sales", value: formatPrice(totalSales) },
    { label: "Today's Sales", value: formatPrice(todaySales) },
    { label: "Total Orders", value: orders.length },
    { label: "Pending Orders", value: orders.filter((o) => o.status === "pending").length },
    { label: "Products", value: products.length },
    {
      label: "Low Stock",
      value: products.filter((p) => p.stock_quantity <= p.low_stock_threshold).length,
    },
    { label: "Customers", value: profiles.length },
    { label: "Avg. Order Value", value: formatPrice(paid.length ? totalSales / paid.length : 0) },
  ];

  return (
    <div>
      <h1 className="text-4xl">Dashboard</h1>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="border border-border bg-background p-5">
            <p className="eyebrow">{k.label}</p>
            <p className="mt-2 font-display text-3xl">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Sales over time (14 days)">
          <LineChart data={[...byDay.values()]}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="sales" stroke="var(--chart-1)" strokeWidth={2} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Orders over time (14 days)">
          <BarChart data={[...byDay.values()]}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="orders" fill="var(--chart-2)" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Top products (units)">
          <BarChart data={topProducts} layout="vertical">
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" width={140} fontSize={11} />
            <Tooltip />
            <Bar dataKey="qty" fill="var(--chart-3)" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Revenue by product">
          <BarChart data={topProducts}>
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Bar dataKey="revenue" fill="var(--chart-4)" />
          </BarChart>
        </ChartCard>
        <ChartCard title="Order status">
          <PieChart>
            <Pie data={statusCounts} dataKey="value" nameKey="name" outerRadius={90} label>
              {statusCounts.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ChartCard>
        <ChartCard title="Customer growth">
          <LineChart data={growthData}>
            <XAxis dataKey="month" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="customers" stroke="var(--chart-5)" strokeWidth={2} />
          </LineChart>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="border border-border bg-background p-5">
      <p className="eyebrow">{title}</p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
