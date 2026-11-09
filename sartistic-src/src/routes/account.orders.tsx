import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatPrice, titleCase } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/account/orders")({
  component: Orders,
});

function Orders() {
  const { user } = useAuth();
  const orders = useQuery({
    queryKey: ["orders", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, product_name, quantity, total_price, image_url)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section>
      <h2 className="font-display text-3xl">Orders</h2>
      {orders.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading orders…</p>}
      {!orders.isLoading && (orders.data?.length ?? 0) === 0 && (
        <div className="mt-6 border border-border p-12 text-center">
          <p className="font-display text-2xl">No orders yet</p>
          <Button asChild className="mt-6 rounded-none">
            <Link to="/shop">Start shopping</Link>
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {orders.data?.map((order) => (
          <article key={order.id} className="border border-border p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-xl">{order.order_number}</p>
                <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  {formatDate(order.created_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl">{formatPrice(order.total)}</p>
                <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  {titleCase(order.status)} · Payment {titleCase(order.payment_status)}
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
              {order.order_items?.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  {item.image_url && (
                    <img src={item.image_url} alt="" className="size-12 bg-secondary object-cover" />
                  )}
                  <span className="flex-1">
                    {item.product_name} × {item.quantity}
                  </span>
                  <span>{formatPrice(item.total_price)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <Link
                to="/account/orders/$id"
                params={{ id: order.id }}
                className="text-xs tracking-[0.16em] uppercase underline underline-offset-4 hover:text-accent"
              >
                View details
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
