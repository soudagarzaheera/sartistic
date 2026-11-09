import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, Minus, Plus, ShieldCheck, Star, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { discountPercent, formatDate, formatPrice } from "@/lib/format";
import {
  primaryImage,
  productQuery,
  productReviewsQuery,
  allProductsQuery,
  productRatingsQuery,
} from "@/lib/catalog";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(productQuery(params.slug)),
  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "Premium Mehndi";
    const title = `${name} | SARTISTIC`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: `Buy ${name} from SARTISTIC — premium Mehndi, tradition crafted beautifully.`,
        },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: `Buy ${name} from SARTISTIC — premium Mehndi, tradition crafted beautifully.`,
        },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data: product, isLoading } = useQuery(productQuery(slug));
  const reviews = useQuery(productReviewsQuery(product?.id));
  const ratings = useQuery(productRatingsQuery);
  const others = useQuery(allProductsQuery);
  const { addItem, setOpen } = useCart();
  const wishlist = useWishlist();

  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="aspect-square animate-pulse bg-secondary" />
          <div className="space-y-4">
            <div className="h-10 w-2/3 animate-pulse bg-secondary" />
            <div className="h-6 w-1/3 animate-pulse bg-secondary" />
            <div className="h-32 animate-pulse bg-secondary" />
          </div>
        </div>
      </div>
    );
  }

  if (!product || !product.is_active) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-32 text-center">
        <h1 className="text-4xl">Product not found</h1>
        <p className="mt-3 text-muted-foreground">
          This product may have been removed or renamed.
        </p>
        <Button asChild className="mt-8 rounded-none">
          <Link to="/shop">Back to shop</Link>
        </Button>
      </div>
    );
  }

  const variants = (product.product_variants ?? []).filter((v) => v.is_active);
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const price = Number(variant?.price ?? product.price);
  const stock = variant?.stock_quantity ?? product.stock_quantity;
  const off = discountPercent(price, Number(product.compare_at_price));
  const rating = ratings.data?.[product.id];
  const images = [...(product.product_images ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
  const gallery = images.length ? images : [{ id: "fallback", image_url: primaryImage(product) }];
  const related = (others.data ?? [])
    .filter((p) => p.id !== product.id && p.category_id === product.category_id)
    .slice(0, 4);

  const line = {
    productId: product.id,
    variantId: variant?.id ?? null,
    name: product.name,
    variantName: variant?.name ?? null,
    slug: product.slug,
    price,
    imageUrl: gallery[0]?.image_url ?? primaryImage(product),
    sku: variant?.sku ?? product.sku,
    stock,
  };

  function add(openDrawer = true) {
    if (stock <= 0) {
      toast.error("This item is currently out of stock");
      return;
    }
    if (variants.length > 0 && !variant) {
      toast.error("Please choose an option first");
      return;
    }
    addItem(line, quantity);
    if (openDrawer) {
      setOpen(true);
    }
  }

  return (
    <div className="pb-24">
      <div className="mx-auto max-w-[1400px] px-5 py-8 lg:px-10">
        <nav className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
          <Link to="/" className="hover:text-accent">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link to="/shop" className="hover:text-accent">
            Shop
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 lg:grid-cols-2 lg:gap-20 lg:px-10">
        <div>
          <div className="overflow-hidden bg-secondary">
            <img
              src={gallery[activeImage]?.image_url}
              alt={product.name}
              width={1000}
              height={1000}
              className="aspect-square w-full object-cover"
            />
          </div>
          {gallery.length > 1 && (
            <div className="mt-4 flex gap-3">
              {gallery.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    "size-20 overflow-hidden border",
                    i === activeImage ? "border-accent" : "border-border",
                  )}
                >
                  <img src={img.image_url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.categories?.name && <p className="eyebrow">{product.categories.name}</p>}
          <h1 className="mt-3 text-4xl leading-[1.08] md:text-5xl">{product.name}</h1>

          {rating && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-4",
                      i < Math.round(rating.average) ? "fill-accent text-accent" : "text-border",
                    )}
                  />
                ))}
              </span>
              <span className="text-muted-foreground">
                {rating.average.toFixed(1)} ({rating.count} reviews)
              </span>
            </div>
          )}

          <div className="mt-6 flex items-end gap-3">
            <span className="font-display text-3xl">{formatPrice(price)}</span>
            {product.compare_at_price && Number(product.compare_at_price) > price && (
              <span className="text-muted-foreground line-through">
                {formatPrice(product.compare_at_price)}
              </span>
            )}
            {off && (
              <span className="bg-accent px-2 py-1 text-[0.6rem] tracking-[0.18em] text-accent-foreground uppercase">
                {off}% off
              </span>
            )}
          </div>

          {product.short_description && (
            <p className="mt-5 text-muted-foreground leading-relaxed">
              {product.short_description}
            </p>
          )}

          {variants.length > 0 && (
            <div className="mt-8">
              <p className="eyebrow">Options</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    disabled={v.stock_quantity <= 0}
                    className={cn(
                      "border px-4 py-2 text-sm transition-colors disabled:opacity-40",
                      variantId === v.id
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border hover:border-accent",
                    )}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center gap-4">
            <div className="flex items-center border border-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                className="grid size-11 place-items-center"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="size-4" />
              </button>
              <span className="w-10 text-center text-sm">{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                className="grid size-11 place-items-center"
                onClick={() => setQuantity((q) => Math.min(Math.max(stock, 1), q + 1))}
              >
                <Plus className="size-4" />
              </button>
            </div>
            <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
              {stock > 0 ? `${stock} in stock` : "Out of stock"}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => add(true)}
              disabled={stock <= 0}
              className="h-12 flex-1 rounded-none"
            >
              Add to Cart
            </Button>
            <Button
              variant="outline"
              disabled={stock <= 0}
              onClick={() => {
                add(false);
                void navigate({ to: "/checkout" });
              }}
              className="h-12 flex-1 rounded-none"
            >
              Buy Now
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Save to wishlist"
              className="size-12 rounded-none"
              onClick={() => void wishlist.toggle(product.id)}
            >
              <Heart className={cn("size-4", wishlist.has(product.id) && "fill-accent text-accent")} />
            </Button>
          </div>

          <div className="mt-8 grid gap-3 border-y border-border py-6 text-sm text-muted-foreground">
            <p className="flex items-center gap-3">
              <Truck className="size-4 text-accent" /> Carefully packed and dispatched from our
              studio
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck className="size-4 text-accent" /> Secure checkout with encrypted
              payments
            </p>
          </div>

          <p className="mt-6 border border-border bg-card p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">Skin safety:</strong> Please review the ingredient
            list and follow the product instructions. Perform an appropriate patch test before use.
          </p>

          <Accordion type="multiple" className="mt-8">
            <Detail title="Description" value={product.description} />
            <Detail title="Ingredients" value={product.ingredients} />
            <Detail title="How to use" value={product.how_to_use} />
            <Detail title="Storage" value={product.storage_instructions} />
            <Detail title="Shipping" value={product.shipping_information} />
            <Detail title="Returns" value={product.return_information} />
          </Accordion>
        </div>
      </div>

      <section className="mx-auto mt-24 max-w-[1400px] px-5 lg:px-10">
        <h2 className="text-3xl md:text-4xl">Customer Reviews</h2>
        {reviews.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading reviews…</p>}
        {!reviews.isLoading && (reviews.data?.length ?? 0) === 0 && (
          <p className="mt-6 text-muted-foreground">
            No reviews published yet for this product. Reviews appear here once a verified customer
            submits one and our team approves it.
          </p>
        )}
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.data?.map((r) => (
            <article key={r.id} className="border border-border bg-card p-6">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-4",
                      i < r.rating ? "fill-accent text-accent" : "text-border",
                    )}
                  />
                ))}
              </div>
              {r.title && <p className="mt-3 font-display text-xl">{r.title}</p>}
              <p className="mt-2 text-sm text-muted-foreground">{r.review}</p>
              <p className="mt-4 text-xs tracking-[0.14em] text-muted-foreground uppercase">
                {r.author_name ?? "Customer"} · {formatDate(r.created_at)}
                {r.is_verified_purchase ? " · Verified purchase" : ""}
              </p>
            </article>
          ))}
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto mt-24 max-w-[1400px] px-5 lg:px-10">
          <h2 className="text-3xl md:text-4xl">You may also like</h2>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} rating={ratings.data?.[p.id]} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky mobile add-to-cart */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background p-3 lg:hidden">
        <span className="font-display text-xl">{formatPrice(price)}</span>
        <Button onClick={() => add(true)} disabled={stock <= 0} className="h-12 flex-1 rounded-none">
          Add to Cart
        </Button>
      </div>
    </div>
  );
}

function Detail({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return (
    <AccordionItem value={title}>
      <AccordionTrigger className="text-sm tracking-[0.14em] uppercase">{title}</AccordionTrigger>
      <AccordionContent className="text-sm whitespace-pre-line text-muted-foreground">
        {value}
      </AccordionContent>
    </AccordionItem>
  );
}
