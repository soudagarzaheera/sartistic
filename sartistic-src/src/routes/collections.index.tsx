import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { categoriesQuery, collectionsQuery } from "@/lib/catalog";

export const Route = createFileRoute("/collections/")({
  head: () => ({
    meta: [
      { title: "Collections | SARTISTIC Mehndi" },
      {
        name: "description",
        content:
          "Explore SARTISTIC collections: premium Mehndi cones, bridal sets, artist bundles, design kits and accessories.",
      },
      { property: "og:title", content: "Collections | SARTISTIC Mehndi" },
      {
        property: "og:description",
        content: "Curated Mehndi collections for artists, brides and celebrations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Collections,
});

function Collections() {
  const collections = useQuery(collectionsQuery);
  const categories = useQuery(categoriesQuery);
  // Admin-managed collections; categories are the fallback before any exist.
  const loading = collections.isLoading || (collections.data?.length === 0 && categories.isLoading);
  const cards: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    image_url: string | null;
  }[] = collections.data?.length ? collections.data : (categories.data ?? []);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Collections</p>
        <h1 className="mt-3 text-5xl leading-[1.05] md:text-6xl">Curated for every occasion</h1>
      </header>

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse bg-secondary" />
          ))}
        {!loading &&
          cards.map((c, i) => (
            <Link
              key={c.id}
              to="/collections/$slug"
              params={{ slug: c.slug }}
              className="group flex min-h-56 flex-col justify-between border border-border bg-card transition-colors hover:border-accent"
            >
              {c.image_url && (
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={c.image_url}
                    alt={c.name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col justify-between gap-6 p-8">
                <span className="eyebrow">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-display text-3xl">{c.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                  <ArrowRight className="mt-6 size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
