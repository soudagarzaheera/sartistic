import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, ProductCardSkeleton } from "@/components/site/ProductCard";
import { allProductsQuery, categoriesQuery, productRatingsQuery } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop Premium Mehndi | SARTISTIC" },
      {
        name: "description",
        content:
          "Browse the full SARTISTIC Mehndi collection — premium cones, bridal sets, artist bundles, design kits and accessories.",
      },
      { property: "og:title", content: "Shop Premium Mehndi | SARTISTIC" },
      {
        property: "og:description",
        content: "Premium Mehndi cones, bridal sets, bundles and design kits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Shop,
});

type Sort = "featured" | "newest" | "price-asc" | "price-desc" | "rating";

const PAGE_SIZE = 12;

function Shop() {
  const products = useQuery(allProductsQuery);
  const categories = useQuery(categoriesQuery);
  const ratings = useQuery(productRatingsQuery);

  const [category, setCategory] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<Sort>("featured");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = [...(products.data ?? [])];
    if (category) list = list.filter((p) => p.categories?.slug === category);
    if (maxPrice) list = list.filter((p) => Number(p.price) <= maxPrice);
    if (inStockOnly) list = list.filter((p) => p.stock_quantity > 0);
    if (featuredOnly) list = list.filter((p) => p.is_featured);
    if (minRating) {
      list = list.filter((p) => (ratings.data?.[p.id]?.average ?? 0) >= minRating);
    }
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case "price-desc":
        list.sort((a, b) => Number(b.price) - Number(a.price));
        break;
      case "newest":
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "rating":
        list.sort(
          (a, b) => (ratings.data?.[b.id]?.average ?? 0) - (ratings.data?.[a.id]?.average ?? 0),
        );
        break;
      default:
        list.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
    }
    return list;
  }, [products.data, category, maxPrice, inStockOnly, featuredOnly, minRating, sort, ratings.data]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Shop</p>
        <h1 className="mt-3 text-5xl leading-[1.05] md:text-6xl">The SARTISTIC Collection</h1>
        <p className="mt-4 text-muted-foreground">
          Premium Mehndi, presented with care. Filter by collection, price and availability.
        </p>
      </header>

      <div className="mt-10 flex items-center justify-between gap-4 border-y border-border py-4">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex items-center gap-2 text-xs tracking-[0.18em] uppercase lg:hidden"
        >
          <SlidersHorizontal className="size-4" /> Filters
        </button>
        <p className="hidden text-xs tracking-[0.18em] text-muted-foreground uppercase lg:block">
          {filtered.length} products
        </p>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as Sort);
            setPage(1);
          }}
          className="border border-border bg-background px-3 py-2 text-xs tracking-[0.12em] uppercase"
        >
          <option value="featured">Featured</option>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="rating">Best Rated</option>
        </select>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[230px_1fr]">
        <aside className={cn("space-y-8", !filtersOpen && "hidden lg:block")}>
          <FilterGroup title="Category">
            <FilterButton active={!category} onClick={() => setCategory(null)}>
              All
            </FilterButton>
            {categories.data?.map((c) => (
              <FilterButton
                key={c.id}
                active={category === c.slug}
                onClick={() => {
                  setCategory(c.slug);
                  setPage(1);
                }}
              >
                {c.name}
              </FilterButton>
            ))}
          </FilterGroup>

          <FilterGroup title="Price">
            {[null, 300, 1000, 2000].map((value) => (
              <FilterButton
                key={String(value)}
                active={maxPrice === value}
                onClick={() => {
                  setMaxPrice(value);
                  setPage(1);
                }}
              >
                {value ? `Under ₹${value}` : "Any price"}
              </FilterButton>
            ))}
          </FilterGroup>

          <FilterGroup title="Availability">
            <FilterButton active={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
              In stock only
            </FilterButton>
            <FilterButton active={featuredOnly} onClick={() => setFeaturedOnly((v) => !v)}>
              Featured only
            </FilterButton>
          </FilterGroup>

          <FilterGroup title="Rating">
            {[0, 3, 4].map((r) => (
              <FilterButton key={r} active={minRating === r} onClick={() => setMinRating(r)}>
                {r === 0 ? "Any rating" : `${r} stars & up`}
              </FilterButton>
            ))}
          </FilterGroup>
        </aside>

        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-3">
            {products.isLoading &&
              Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} rating={ratings.data?.[product.id]} />
            ))}
          </div>

          {!products.isLoading && filtered.length === 0 && (
            <div className="border border-border py-24 text-center">
              <p className="font-display text-2xl">No products match those filters</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try widening your price range or clearing the category.
              </p>
            </div>
          )}

          {pageCount > 1 && (
            <div className="mt-14 flex items-center justify-center gap-2">
              {Array.from({ length: pageCount }).map((_, i) => (
                <Button
                  key={i}
                  variant={current === i + 1 ? "default" : "outline"}
                  size="sm"
                  className="size-9 rounded-none p-0"
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <div className="mt-3 flex flex-col items-start gap-1.5">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-sm transition-colors hover:text-accent",
        active ? "text-accent underline underline-offset-4" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
