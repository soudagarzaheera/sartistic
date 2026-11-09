import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ProductCard, ProductCardSkeleton } from "@/components/site/ProductCard";
import { allProductsQuery, productRatingsQuery } from "@/lib/catalog";

const searchSchema = z.object({ q: z.string().catch("") });

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Search | SARTISTIC Mehndi" },
      {
        name: "description",
        content: "Search the SARTISTIC catalogue by product name, SKU, category or description.",
      },
      { property: "og:title", content: "Search | SARTISTIC" },
      { property: "og:description", content: "Find your next Mehndi essential." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

const RECENT_KEY = "sartistic.recent-searches";

function SearchPage() {
  const { q } = Route.useSearch();
  const products = useQuery(allProductsQuery);
  const ratings = useQuery(productRatingsQuery);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]);
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    if (!q) return;
    setRecent((prev) => {
      const next = [q, ...prev.filter((r) => r !== q)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [q]);

  const term = q.trim().toLowerCase();
  const results = (products.data ?? []).filter((p) =>
    [p.name, p.sku, p.description, p.short_description, p.categories?.name]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(term)),
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <p className="eyebrow">Search</p>
      <h1 className="mt-3 text-4xl md:text-5xl">
        {term ? `Results for "${q}"` : "Search the collection"}
      </h1>

      {recent.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="eyebrow">Recent</span>
          {recent.map((r) => (
            <a
              key={r}
              href={`/search?q=${encodeURIComponent(r)}`}
              className="border border-border px-3 py-1.5 text-muted-foreground hover:border-accent"
            >
              {r}
            </a>
          ))}
        </div>
      )}

      <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
        {products.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        {term &&
          results.map((product) => (
            <ProductCard key={product.id} product={product} rating={ratings.data?.[product.id]} />
          ))}
      </div>

      {term && !products.isLoading && results.length === 0 && (
        <div className="mt-12 border border-border py-24 text-center">
          <p className="font-display text-2xl">Nothing matched "{q}"</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different word, or browse the full shop.
          </p>
        </div>
      )}
    </div>
  );
}
