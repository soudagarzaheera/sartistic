import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/site/ProductCard";
import { allProductsQuery, productRatingsQuery } from "@/lib/catalog";
import { useWishlist } from "@/hooks/useWishlist";

export const Route = createFileRoute("/account/wishlist")({
  component: WishlistPage,
});

function WishlistPage() {
  const wishlist = useWishlist();
  const products = useQuery(allProductsQuery);
  const ratings = useQuery(productRatingsQuery);

  const saved = (products.data ?? []).filter((p) => wishlist.ids.includes(p.id));

  return (
    <section>
      <h2 className="font-display text-3xl">Wishlist</h2>
      {wishlist.isLoading || products.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : saved.length === 0 ? (
        <div className="mt-6 border border-border p-12 text-center">
          <p className="font-display text-2xl">Nothing saved yet</p>
          <Button asChild className="mt-6 rounded-none">
            <Link to="/shop">Browse the collection</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-3">
          {saved.map((p) => (
            <ProductCard key={p.id} product={p} rating={ratings.data?.[p.id]} />
          ))}
        </div>
      )}
    </section>
  );
}
