import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { galleryCategoriesQuery, galleryImagesQuery } from "@/lib/catalog";

export const Route = createFileRoute("/mehndi-art")({
  head: () => ({
    meta: [
      { title: "Mehndi Art Gallery | SARTISTIC" },
      {
        name: "description",
        content:
          "A gallery of Mehndi designs — bridal, Arabic, traditional, minimal, festive and contemporary styles from SARTISTIC.",
      },
      { property: "og:title", content: "Mehndi Art Gallery | SARTISTIC" },
      {
        property: "og:description",
        content: "Bridal, Arabic, traditional, minimal, festive and contemporary Mehndi designs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const images = useQuery(galleryImagesQuery);
  const categories = useQuery(galleryCategoriesQuery);
  const [filter, setFilter] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const list = (images.data ?? []).filter((img) => {
    if (!filter) return true;
    const cat = img.gallery_categories as unknown as { slug: string } | null;
    return cat?.slug === filter;
  });

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Mehndi Art</p>
        <h1 className="mt-3 text-5xl leading-[1.05] md:text-6xl">The Design Gallery</h1>
        <p className="mt-4 text-muted-foreground">
          A living archive of Mehndi styles — for inspiration before your next celebration.
        </p>
      </header>

      <div className="mt-10 flex flex-wrap gap-2 border-y border-border py-4">
        <FilterChip active={!filter} onClick={() => setFilter(null)}>
          All
        </FilterChip>
        {categories.data?.map((c) => (
          <FilterChip key={c.id} active={filter === c.slug} onClick={() => setFilter(c.slug)}>
            {c.name}
          </FilterChip>
        ))}
      </div>

      {images.isLoading ? (
        <div className="mt-12 columns-2 gap-4 lg:columns-3 [&>*]:mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse bg-secondary" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-12 border border-border py-24 text-center">
          <p className="font-display text-2xl">No designs in this style yet</p>
        </div>
      ) : (
        <div className="mt-12 columns-2 gap-4 lg:columns-3 [&>*]:mb-4">
          {list.map((img, index) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(index)}
              className="group block w-full break-inside-avoid overflow-hidden"
            >
              <img
                src={img.image_url}
                alt={img.title ?? "Mehndi design"}
                loading="lazy"
                className="w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox !== null && list[lightbox] && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-foreground/95 p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute top-5 right-5 grid size-11 place-items-center text-background"
          >
            <X className="size-6" />
          </button>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => setLightbox((i) => ((i ?? 0) - 1 + list.length) % list.length)}
            className="absolute left-3 grid size-11 place-items-center text-background md:left-8"
          >
            <ChevronLeft className="size-7" />
          </button>
          <figure className="max-h-[85vh] max-w-3xl text-center">
            <img
              src={list[lightbox].image_url}
              alt={list[lightbox].title ?? "Mehndi design"}
              className="max-h-[75vh] w-auto object-contain"
            />
            <figcaption className="mt-4 text-sm text-background/80">
              {list[lightbox].title} · {lightbox + 1} / {list.length}
            </figcaption>
          </figure>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => setLightbox((i) => ((i ?? 0) + 1) % list.length)}
            className="absolute right-3 grid size-11 place-items-center text-background md:right-8"
          >
            <ChevronRight className="size-7" />
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({
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
        "border px-4 py-2 text-xs tracking-[0.16em] uppercase transition-colors",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border text-muted-foreground hover:border-accent",
      )}
    >
      {children}
    </button>
  );
}
