import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { discountPercent, formatPrice } from "@/lib/format";
import { primaryImage, type Product } from "@/lib/catalog";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";

export function ProductCard({
  product,
  rating,
}: {
  product: Product;
  rating?: { average: number; count: number } | undefined;
}) {
  const { addItem, setOpen } = useCart();
  const wishlist = useWishlist();
  const off = discountPercent(Number(product.price), Number(product.compare_at_price));
  const image = primaryImage(product);
  const soldOut = product.stock_quantity <= 0;

  return (
    <article className="group relative">
      <div className="relative overflow-hidden bg-secondary">
        <Link to="/product/$slug" params={{ slug: product.slug }}>
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            width={1000}
            height={1000}
            className="aspect-square w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
          />
        </Link>

        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {off && (
            <span className="bg-accent px-2 py-1 text-[0.6rem] tracking-[0.18em] text-accent-foreground uppercase">
              {off}% off
            </span>
          )}
          {soldOut && (
            <span className="bg-foreground px-2 py-1 text-[0.6rem] tracking-[0.18em] text-background uppercase">
              Sold out
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label="Add to wishlist"
          onClick={() => void wishlist.toggle(product.id)}
          className="absolute top-3 right-3 grid size-9 place-items-center bg-background/85 backdrop-blur transition-transform hover:scale-110"
        >
          <Heart
            className={cn("size-4", wishlist.has(product.id) && "fill-accent text-accent")}
          />
        </button>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-all duration-500 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <Button
            className="h-11 w-full rounded-none"
            disabled={soldOut}
            onClick={() => {
              addItem({
                productId: product.id,
                variantId: null,
                name: product.name,
                variantName: null,
                slug: product.slug,
                price: Number(product.price),
                imageUrl: image,
                sku: product.sku,
                stock: product.stock_quantity,
              });
              setOpen(true);
              toast.success(`${product.name} added to your bag`);
            }}
          >
            {soldOut ? "Sold Out" : "Add to Cart"}
          </Button>
        </div>
      </div>

      <div className="pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            className="font-display text-xl leading-tight transition-colors group-hover:text-accent"
          >
            {product.name}
          </Link>
          <div className="text-right">
            <p className="text-sm">{formatPrice(product.price)}</p>
            {product.compare_at_price && (
              <p className="text-xs text-muted-foreground line-through">
                {formatPrice(product.compare_at_price)}
              </p>
            )}
          </div>
        </div>
        {product.short_description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {product.short_description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          {rating && rating.count > 0 ? (
            <>
              <Star className="size-3 fill-gold text-gold" />
              <span>
                {rating.average.toFixed(1)} ({rating.count})
              </span>
            </>
          ) : (
            <span>No reviews yet</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square w-full bg-secondary" />
      <div className="mt-4 h-4 w-2/3 bg-secondary" />
      <div className="mt-2 h-3 w-1/3 bg-secondary" />
    </div>
  );
}
