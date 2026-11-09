import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { categoriesQuery } from "@/lib/catalog";

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
  const categories = useQuery(categoriesQuery);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Collections</p>
        <h1 className="mt-3 text-5xl leading-[1.05] md:text-6xl">Curated for every occasion</h1>
      </header>

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {categories.isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse bg-secondary" />
          ))}
        {categories.data?.map((c, i) => (
          <Link
            key={c.id}
            to="/collections/$slug"
            params={{ slug: c.slug }}
            className="group flex min-h-56 flex-col justify-between border border-border bg-card p-8 transition-colors hover:border-accent"
          >
            <span className="eyebrow">0{i + 1}</span>
            <div>
              <p className="font-display text-3xl">{c.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
              <ArrowRight className="mt-6 size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
