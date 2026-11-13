import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal, SectionHeading } from "@/components/site/Reveal";
import { ProductCard, ProductCardSkeleton } from "@/components/site/ProductCard";
import {
  categoriesQuery,
  collectionsQuery,
  featuredProductsQuery,
  galleryImagesQuery,
  homepageSectionsQuery,
  productRatingsQuery,
  siteSettingsQuery,
  type HomepageSection,
} from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(homepageSectionsQuery),
  head: () => ({
    meta: [
      { title: "SARTISTIC | Premium Mehndi — Tradition, Crafted Beautifully" },
      {
        name: "description",
        content:
          "Discover SARTISTIC Mehndi — premium henna cones, bridal sets, bundles and design kits, thoughtfully presented for celebration and artistic expression.",
      },
      { property: "og:title", content: "SARTISTIC | Premium Mehndi" },
      {
        property: "og:description",
        content: "Tradition, Crafted Beautifully. Premium Mehndi for moments that matter.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const STEPS = [
  {
    n: "01",
    title: "Prepare",
    body: "Clean and dry the skin, then settle in somewhere comfortable.",
  },
  { n: "02", title: "Apply", body: "Snip the cone tip and draw with steady, even pressure." },
  {
    n: "03",
    title: "Let It Dry",
    body: "Allow the paste to dry undisturbed for the time noted on your pack.",
  },
  { n: "04", title: "Reveal", body: "Gently remove the dried paste and let the colour develop." },
];

const FAQS = [
  {
    q: "How should I prepare before applying Mehndi?",
    a: "Start with clean, dry skin free of oils or lotions. Always review the ingredient list and perform an appropriate patch test before use.",
  },
  {
    q: "How long does delivery take?",
    a: "Orders are dispatched within 2–3 business days. Delivery timelines vary by location and are shown on each product page.",
  },
  {
    q: "Can I return a product?",
    a: "Unopened items may be returned within 7 days of delivery. Return details are listed on every product page.",
  },
  {
    q: "Do you supply artists and studios?",
    a: "Yes. Our bundles are made for artists working through busy wedding and festive seasons. Contact us for larger quantities.",
  },
];

/**
 * Built-in defaults, used for any field the admin leaves blank and as the
 * full layout if the homepage_sections table isn't available.
 */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  hero: {
    eyebrow: "Premium Mehndi · Est. Artistry",
    heading: "Tradition,\nCrafted Beautifully.",
    subtitle:
      "Discover SARTISTIC Mehndi — thoughtfully presented for moments of beauty, celebration and artistic expression.",
    image_url: "/images/image1.jpg",
    image_alt: "Hands adorned with intricate Mehndi patterns resting on ivory silk",
    primary_label: "Shop Mehndi",
    primary_link: "/shop",
    secondary_label: "Explore Our Story",
    secondary_link: "/about",
  },
  promo: { text: "", link_label: "", link: "" },
  trust: {
    items: [
      "Premium Quality",
      "Authentic Mehndi",
      "Beautiful Application",
      "Carefully Presented",
      "Secure Checkout",
    ],
  },
  featured_products: {
    eyebrow: "The Collection",
    title: "Shop SARTISTIC",
    subtitle: "Discover our Mehndi collection.",
  },
  collections: {
    eyebrow: "Curated",
    title: "Shop by Collection",
    subtitle: "From everyday cones to bridal presentation sets.",
  },
  story: {
    eyebrow: "Our Story",
    title: "More Than Mehndi.\nIt's an Art Form.",
    body: "SARTISTIC celebrates the beauty of Mehndi as an artistic tradition — the patience of the hand, the rhythm of the line, the quiet ceremony of waiting for colour to appear.\n\nWe take that tradition and give it a modern, premium brand experience: considered presentation, clear information and products made for artists and for celebration.",
    image_url: "/images/image2.jpg",
    image_alt: "Henna leaves, paste and a carved Indian printing block",
  },
  why: { eyebrow: "Why SARTISTIC", title: "Six reasons the ritual feels different." },
  gallery: {
    eyebrow: "Mehndi Art",
    title: "A Gallery of Designs",
    subtitle: "Bridal, Arabic, Traditional, Minimal, Festive and Contemporary.",
  },
  how_to_use: { eyebrow: "The Ritual", title: "How to Use" },
  reviews: { eyebrow: "Reviews", title: "From Our Customers" },
  social: { eyebrow: "@sartistic", title: "Follow the artistry" },
  faq: { eyebrow: "Questions", title: "Frequently Asked" },
  cta: {
    eyebrow: "SARTISTIC",
    title: "Tradition, Crafted Beautifully.",
    subtitle: "Where timeless Mehndi artistry meets modern elegance.",
    button_label: "Shop Mehndi",
    button_link: "/shop",
  },
};

const DEFAULT_ORDER = [
  "hero",
  "promo",
  "trust",
  "featured_products",
  "collections",
  "story",
  "why",
  "gallery",
  "how_to_use",
  "reviews",
  "social",
  "faq",
  "cta",
];

type Content = Record<string, unknown>;

/** Reads a string field, falling back to the default when blank. */
function text(content: Content, key: string, fallback: Content): string {
  const v = content[key];
  if (typeof v === "string" && v.trim()) return v;
  const d = fallback[key];
  return typeof d === "string" ? d : "";
}

function Lines({ value }: { value: string }) {
  const parts = value.split("\n");
  return (
    <>
      {parts.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < parts.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

/** Internal paths use the router; anything else is a normal link. */
function SmartLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  if (to.startsWith("/")) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Home() {
  const sections = useQuery(homepageSectionsQuery);

  const layout: HomepageSection[] = sections.data
    ? sections.data.filter((s) => s.is_visible)
    : DEFAULT_ORDER.filter((k) => k !== "promo").map((key, i) => ({
        key,
        label: key,
        is_visible: true,
        sort_order: i,
        content: {},
      }));

  return (
    <>
      {layout.map((s) => {
        const content = { ...(s.content ?? {}) };
        const fallback = DEFAULTS[s.key] ?? {};
        const Section = SECTIONS[s.key];
        return Section ? <Section key={s.key} c={content} d={fallback} /> : null;
      })}
    </>
  );
}

type SectionProps = { c: Content; d: Content };

const SECTIONS: Record<string, (props: SectionProps) => ReactNode> = {
  hero: HeroSection,
  promo: PromoSection,
  trust: TrustSection,
  featured_products: FeaturedProductsSection,
  collections: CollectionsSection,
  story: StorySection,
  why: WhySection,
  gallery: GallerySection,
  how_to_use: HowToUseSection,
  reviews: ReviewsSection,
  social: SocialSection,
  faq: FaqSection,
  cta: CtaSection,
};

function HeroSection({ c, d }: SectionProps) {
  const secondaryLabel = text(c, "secondary_label", d);
  return (
    <section className="relative -mt-20 h-[92vh] min-h-[620px] w-full overflow-hidden lg:-mt-24">
      <img
        src={text(c, "image_url", d)}
        alt={text(c, "image_alt", d)}
        width={1600}
        height={1200}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 gradient-overlay" />
      <div className="relative mx-auto flex h-full max-w-[1400px] items-end px-5 pb-20 lg:items-center lg:px-10 lg:pb-0">
        <div className="max-w-2xl text-primary-foreground">
          <p className="text-[0.68rem] tracking-[0.32em] uppercase opacity-80">
            {text(c, "eyebrow", d)}
          </p>
          <h1 className="mt-6 font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.98]">
            <Lines value={text(c, "heading", d)} />
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed opacity-85">
            {text(c, "subtitle", d)}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary" className="h-13 rounded-none px-8">
              <SmartLink to={text(c, "primary_link", d)}>{text(c, "primary_label", d)}</SmartLink>
            </Button>
            {secondaryLabel && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 rounded-none border-current/50 bg-transparent px-8 text-current hover:bg-current/10"
              >
                <SmartLink to={text(c, "secondary_link", d)}>{secondaryLabel}</SmartLink>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PromoSection({ c }: SectionProps) {
  const message = typeof c["text"] === "string" ? c["text"].trim() : "";
  if (!message) return null;
  const link = typeof c["link"] === "string" ? c["link"] : "";
  const label = typeof c["link_label"] === "string" ? c["link_label"] : "";
  return (
    <section className="bg-accent text-accent-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-3 text-center text-sm lg:px-10">
        <span>{message}</span>
        {link && label && (
          <SmartLink
            to={link}
            className="text-xs tracking-[0.18em] uppercase underline underline-offset-4"
          >
            {label}
          </SmartLink>
        )}
      </div>
    </section>
  );
}

function TrustSection({ c, d }: SectionProps) {
  const items = (
    Array.isArray(c["items"]) && c["items"].length ? c["items"] : (d["items"] as string[])
  ).filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-5 lg:px-10">
        {items.map((item) => (
          <span key={item} className="eyebrow">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function FeaturedProductsSection({ c, d }: SectionProps) {
  const featured = useQuery(featuredProductsQuery);
  const ratings = useQuery(productRatingsQuery);
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
      <Reveal>
        <SectionHeading
          eyebrow={text(c, "eyebrow", d)}
          title={text(c, "title", d)}
          subtitle={text(c, "subtitle", d)}
        />
      </Reveal>
      <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
        {featured.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        {featured.isError && (
          <p className="col-span-full text-center text-sm text-muted-foreground">
            We couldn't load products right now. Please refresh the page.
          </p>
        )}
        {featured.data?.map((product, i) => (
          <Reveal key={product.id} delay={i * 70}>
            <ProductCard product={product} rating={ratings.data?.[product.id]} />
          </Reveal>
        ))}
        {featured.data?.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted-foreground">
            New pieces are on their way.
          </p>
        )}
      </div>
      <div className="mt-14 text-center">
        <Button asChild variant="outline" className="h-12 rounded-none px-8">
          <Link to="/shop">
            View All Products <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function CollectionsSection({ c, d }: SectionProps) {
  const collections = useQuery(collectionsQuery);
  const categories = useQuery(categoriesQuery);
  const featured = (collections.data ?? []).filter((x) => x.is_featured);
  // Featured collections first; categories are the fallback before any are set up.
  const cards = featured.length
    ? featured
    : (categories.data ?? []).map((x) => ({ ...x, image_url: x.image_url ?? null }));
  if (!collections.isLoading && !categories.isLoading && cards.length === 0) return null;

  return (
    <section className="bg-card py-24">
      <div className="mx-auto max-w-[1400px] px-5 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow={text(c, "eyebrow", d)}
            title={text(c, "title", d)}
            subtitle={text(c, "subtitle", d)}
            align="left"
          />
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((col, i) => (
            <Reveal key={col.id} delay={i * 60}>
              <Link
                to="/collections/$slug"
                params={{ slug: col.slug }}
                className="group block h-full border border-border bg-background transition-colors hover:border-accent"
              >
                {col.image_url && (
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={col.image_url}
                      alt={col.name}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  </div>
                )}
                <div className="p-7">
                  <span className="eyebrow">{String(i + 1).padStart(2, "0")}</span>
                  <p className="mt-6 font-display text-2xl leading-tight">{col.name}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {col.description}
                  </p>
                  <ArrowRight className="mt-6 size-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function StorySection({ c, d }: SectionProps) {
  const paragraphs = text(c, "body", d)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <Reveal>
          <img
            src={text(c, "image_url", d)}
            alt={text(c, "image_alt", d)}
            loading="lazy"
            width={1408}
            height={1008}
            className="w-full object-cover"
          />
        </Reveal>
        <Reveal delay={120} className="lg:pl-10">
          <p className="eyebrow">{text(c, "eyebrow", d)}</p>
          <h2 className="mt-4 text-4xl leading-[1.05] md:text-5xl">
            <Lines value={text(c, "title", d)} />
          </h2>
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className={`${i === 0 ? "mt-6" : "mt-4"} text-muted-foreground leading-relaxed`}
            >
              {p}
            </p>
          ))}
          <Button asChild variant="outline" className="mt-8 h-12 rounded-none px-8">
            <Link to="/about">Discover SARTISTIC</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

function WhySection({ c, d }: SectionProps) {
  const settings = useQuery(siteSettingsQuery);
  const why =
    (settings.data?.["why_sartistic"] as
      { number: string; title: string; description: string }[] | undefined) ?? [];
  return (
    <section className="bg-primary py-24 text-primary-foreground">
      <div className="mx-auto max-w-[1400px] px-5 lg:px-10">
        <Reveal>
          <p className="text-[0.68rem] tracking-[0.28em] uppercase opacity-70">
            {text(c, "eyebrow", d)}
          </p>
          <h2 className="mt-4 max-w-xl text-4xl leading-[1.05] md:text-5xl">
            {text(c, "title", d)}
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {why.map((item, i) => (
            <Reveal key={item.number} delay={i * 60}>
              <div className="border-t border-current/20 pt-6">
                <div className="flex items-center gap-3">
                  <Sparkles className="size-4 opacity-70" />
                  <span className="text-xs tracking-[0.2em] opacity-70">{item.number}</span>
                </div>
                <p className="mt-4 font-display text-2xl">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed opacity-75">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function GallerySection({ c, d }: SectionProps) {
  const gallery = useQuery(galleryImagesQuery);
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
      <Reveal>
        <SectionHeading
          eyebrow={text(c, "eyebrow", d)}
          title={text(c, "title", d)}
          subtitle={text(c, "subtitle", d)}
        />
      </Reveal>
      <div className="mt-12 columns-2 gap-4 lg:columns-3 [&>*]:mb-4">
        {gallery.data?.slice(0, 6).map((img) => (
          <img
            key={img.id}
            src={img.image_url}
            alt={img.title ?? "Mehndi design"}
            loading="lazy"
            className="w-full break-inside-avoid object-cover transition-transform duration-700 hover:scale-[1.02]"
          />
        ))}
      </div>
      <div className="mt-12 text-center">
        <Button asChild variant="outline" className="h-12 rounded-none px-8">
          <Link to="/mehndi-art">View Designs</Link>
        </Button>
      </div>
    </section>
  );
}

function HowToUseSection({ c, d }: SectionProps) {
  return (
    <section className="bg-card py-24">
      <div className="mx-auto max-w-[1400px] px-5 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow={text(c, "eyebrow", d)}
            title={text(c, "title", d)}
            align="left"
          />
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 70}>
              <div className="border-t border-border pt-6">
                <span className="font-display text-4xl text-accent">{s.n}</span>
                <p className="mt-3 font-display text-2xl">{s.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-10 max-w-2xl text-xs text-muted-foreground">
          Please review the ingredient list and follow the product instructions supplied with your
          order. Perform an appropriate patch test before use.
        </p>
      </div>
    </section>
  );
}

function ReviewsSection({ c, d }: SectionProps) {
  const reviews = useQuery({
    queryKey: ["reviews", "homepage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, title, review, author_name, created_at, products(name)")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
      <Reveal>
        <SectionHeading eyebrow={text(c, "eyebrow", d)} title={text(c, "title", d)} />
      </Reveal>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {reviews.data?.length ? (
          reviews.data.map((r) => (
            <div key={r.id} className="border border-border p-7">
              <div className="flex gap-1">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-gold text-gold" />
                ))}
              </div>
              <p className="mt-4 font-display text-xl">{r.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{r.review}</p>
              <p className="mt-6 text-xs text-muted-foreground">
                {r.author_name ?? "Verified customer"} · {formatDate(r.created_at)}
              </p>
            </div>
          ))
        ) : (
          <p className="col-span-full text-center text-sm text-muted-foreground">
            No published reviews yet.
          </p>
        )}
      </div>
    </section>
  );
}

function SocialSection({ c, d }: SectionProps) {
  const gallery = useQuery(galleryImagesQuery);
  return (
    <section className="bg-card py-20">
      <div className="mx-auto max-w-[1400px] px-5 text-center lg:px-10">
        <p className="eyebrow">{text(c, "eyebrow", d)}</p>
        <h2 className="mt-3 text-3xl md:text-4xl">{text(c, "title", d)}</h2>
        <div className="mt-10 grid grid-cols-3 gap-3 lg:grid-cols-6">
          {gallery.data?.slice(0, 6).map((img) => (
            <img
              key={`social-${img.id}`}
              src={img.image_url}
              alt={img.title ?? "Mehndi design"}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ c, d }: SectionProps) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-24 lg:px-10">
      <Reveal>
        <SectionHeading eyebrow={text(c, "eyebrow", d)} title={text(c, "title", d)} />
      </Reveal>
      <Accordion type="single" collapsible className="mt-10">
        {FAQS.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="text-left font-display text-xl">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function CtaSection({ c, d }: SectionProps) {
  return (
    <section className="relative overflow-hidden bg-primary py-28 text-primary-foreground">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-10">
        <p className="text-[0.68rem] tracking-[0.28em] uppercase opacity-70">
          {text(c, "eyebrow", d)}
        </p>
        <h2 className="mt-5 text-4xl leading-[1.05] md:text-6xl">{text(c, "title", d)}</h2>
        <p className="mx-auto mt-5 max-w-lg opacity-80">{text(c, "subtitle", d)}</p>
        <Button asChild size="lg" variant="secondary" className="mt-9 h-13 rounded-none px-10">
          <SmartLink to={text(c, "button_link", d)}>{text(c, "button_label", d)}</SmartLink>
        </Button>
      </div>
    </section>
  );
}
