import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProductCard, ProductCardSkeleton } from "@/components/site/ProductCard";
import { allProductsQuery, categoriesQuery, productRatingsQuery } from "@/lib/catalog";

export const Route = createFileRoute("/collections/$slug")({
  head: ({ params }) => {
    const title = `${params.slug.replace(/-/g, " ")} Collection | SARTISTIC`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: `Shop the SARTISTIC ${params.slug.replace(/-/g, " ")} collection — premium Mehndi presented with care.`,
        },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: "Premium Mehndi collections from SARTISTIC.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CollectionPage,
});

function CollectionPage() {
  const { slug } = Route.useParams();
  const products = useQuery(allProductsQuery);
  const categories = useQuery(categoriesQuery);
  const ratings = useQuery(productRatingsQuery);

  const category = categories.data?.find((c) => c.slug === slug);
  const list = (products.data ?? []).filter((p) => p.categories?.slug === slug);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <nav className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
        <Link to="/" className="hover:text-accent">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link to="/collections" className="hover:text-accent">
          Collections
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{category?.name ?? slug}</span>
      </nav>

      <header className="mt-8 max-w-2xl">
        <h1 className="text-5xl leading-[1.05] md:text-6xl">{category?.name ?? "Collection"}</h1>
        {category?.description && (
          <p className="mt-4 text-muted-foreground">{category.description}</p>
        )}
      </header>

      <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
        {products.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        {list.map((product) => (
          <ProductCard key={product.id} product={product} rating={ratings.data?.[product.id]} />
        ))}
      </div>

      {!products.isLoading && list.length === 0 && (
        <div className="mt-14 border border-border py-24 text-center">
          <p className="font-display text-2xl">Nothing here yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This collection is being prepared. Explore the full shop meanwhile.
          </p>
        </div>
      )}
    </div>
  );
}
