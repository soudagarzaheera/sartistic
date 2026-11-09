import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/hooks/useCart";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart | SARTISTIC" },
      { name: "description", content: "Review your SARTISTIC Mehndi selection before checkout." },
      { property: "og:title", content: "Your Cart | SARTISTIC" },
      { property: "og:description", content: "Review your selection before checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotal, setQuantity, removeItem } = useCart();
  const shipping = subtotal >= 999 || subtotal === 0 ? 0 : 79;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <p className="eyebrow">Cart</p>
      <h1 className="mt-3 text-5xl md:text-6xl">Your selection</h1>

      {items.length === 0 ? (
        <div className="mt-14 border border-border py-24 text-center">
          <p className="font-display text-3xl">Your cart is empty</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Explore the collection and find your next Mehndi essential.
          </p>
          <Button asChild className="mt-8 h-12 rounded-none px-8">
            <Link to="/shop">Shop Mehndi</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
          <div className="divide-y divide-border border-y border-border">
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantId}`} className="flex gap-5 py-6">
                <Link to="/product/$slug" params={{ slug: item.slug }} className="shrink-0">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="size-28 bg-secondary object-cover"
                  />
                </Link>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <Link
                      to="/product/$slug"
                      params={{ slug: item.slug }}
                      className="font-display text-xl hover:text-accent"
                    >
                      {item.name}
                    </Link>
                    {item.variantName && (
                      <p className="text-sm text-muted-foreground">{item.variantName}</p>
                    )}
                    <p className="mt-1 text-sm">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center border border-border">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        className="grid size-9 place-items-center"
                        onClick={() =>
                          setQuantity(item.productId, item.variantId, item.quantity - 1)
                        }
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        className="grid size-9 place-items-center"
                        onClick={() =>
                          setQuantity(item.productId, item.variantId, item.quantity + 1)
                        }
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.variantId)}
                      className="flex items-center gap-1.5 text-xs tracking-[0.14em] text-muted-foreground uppercase hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                </div>
                <p className="font-display text-xl">{formatPrice(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>

          <aside className="h-fit border border-border bg-card p-8">
            <p className="eyebrow">Summary</p>
            <dl className="mt-6 space-y-3 text-sm">
              <Row label="Subtotal" value={formatPrice(subtotal)} />
              <Row label="Shipping" value={shipping ? formatPrice(shipping) : "Free"} />
            </dl>
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <span className="eyebrow">Total</span>
              <span className="font-display text-2xl">{formatPrice(subtotal + shipping)}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Coupons and final shipping are calculated securely at checkout.
            </p>
            <Button asChild className="mt-6 h-12 w-full rounded-none">
              <Link to="/checkout">Proceed to Checkout</Link>
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
