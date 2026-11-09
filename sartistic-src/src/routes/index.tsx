import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  featuredProductsQuery,
  galleryImagesQuery,
  productRatingsQuery,
  siteSettingsQuery,
} from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
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

const TRUST = [
  "Premium Quality",
  "Authentic Mehndi",
  "Beautiful Application",
  "Carefully Presented",
  "Secure Checkout",
];

const STEPS = [
  { n: "01", title: "Prepare", body: "Clean and dry the skin, then settle in somewhere comfortable." },
  { n: "02", title: "Apply", body: "Snip the cone tip and draw with steady, even pressure." },
  { n: "03", title: "Let It Dry", body: "Allow the paste to dry undisturbed for the time noted on your pack." },
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

function Home() {
  const featured = useQuery(featuredProductsQuery);
  const categories = useQuery(categoriesQuery);
  const ratings = useQuery(productRatingsQuery);
  const gallery = useQuery(galleryImagesQuery);
  const settings = useQuery(siteSettingsQuery);
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

  const why = (settings.data?.["why_sartistic"] as
    | { number: string; title: string; description: string }[]
    | undefined) ?? [];

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-20 h-[92vh] min-h-[620px] w-full overflow-hidden lg:-mt-24">
        <img
          src="/images/image1.jpg"
          alt="Hands adorned with intricate Mehndi patterns resting on ivory silk"
          width={1600}
          height={1200}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 gradient-overlay" />
        <div className="relative mx-auto flex h-full max-w-[1400px] items-end px-5 pb-20 lg:items-center lg:px-10 lg:pb-0">
          <div className="max-w-2xl text-primary-foreground">
            <p className="text-[0.68rem] tracking-[0.32em] uppercase opacity-80">
              Premium Mehndi · Est. Artistry
            </p>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.98]">
              Tradition,
              <br />
              Crafted Beautifully.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed opacity-85">
              Discover SARTISTIC Mehndi — thoughtfully presented for moments of beauty,
              celebration and artistic expression.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary" className="h-13 rounded-none px-8">
                <Link to="/shop">Shop Mehndi</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 rounded-none border-current/50 bg-transparent px-8 text-current hover:bg-current/10"
              >
                <Link to="/about">Explore Our Story</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-5 lg:px-10">
          {TRUST.map((item) => (
            <span key={item} className="eyebrow">
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow="The Collection"
            title="Shop SARTISTIC"
            subtitle="Discover our Mehndi collection."
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

      {/* Collections */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-[1400px] px-5 lg:px-10">
          <Reveal>
            <SectionHeading
              eyebrow="Curated"
              title="Shop by Collection"
              subtitle="From everyday cones to bridal presentation sets."
              align="left"
            />
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
            {categories.data?.map((c, i) => (
              <Reveal key={c.id} delay={i * 60}>
                <Link
                  to="/collections/$slug"
                  params={{ slug: c.slug }}
                  className="group block border border-border bg-background p-7 transition-colors hover:border-accent"
                >
                  <span className="eyebrow">0{i + 1}</span>
                  <p className="mt-6 font-display text-2xl leading-tight">{c.name}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                  <ArrowRight className="mt-6 size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Brand story */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <Reveal>
            <img
              src="/images/image2.jpg"
              alt="Henna leaves, paste and a carved Indian printing block"
              loading="lazy"
              width={1408}
              height={1008}
              className="w-full object-cover"
            />
          </Reveal>
          <Reveal delay={120} className="lg:pl-10">
            <p className="eyebrow">Our Story</p>
            <h2 className="mt-4 text-4xl leading-[1.05] md:text-5xl">
              More Than Mehndi.
              <br />
              It's an Art Form.
            </h2>
            <p className="mt-6 text-muted-foreground leading-relaxed">
              SARTISTIC celebrates the beauty of Mehndi as an artistic tradition — the patience of
              the hand, the rhythm of the line, the quiet ceremony of waiting for colour to appear.
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We take that tradition and give it a modern, premium brand experience: considered
              presentation, clear information and products made for artists and for celebration.
            </p>
            <Button asChild variant="outline" className="mt-8 h-12 rounded-none px-8">
              <Link to="/about">Discover SARTISTIC</Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* Why SARTISTIC */}
      <section className="bg-primary py-24 text-primary-foreground">
        <div className="mx-auto max-w-[1400px] px-5 lg:px-10">
          <Reveal>
            <p className="text-[0.68rem] tracking-[0.28em] uppercase opacity-70">Why SARTISTIC</p>
            <h2 className="mt-4 max-w-xl text-4xl leading-[1.05] md:text-5xl">
              Six reasons the ritual feels different.
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

      {/* Gallery preview */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
        <Reveal>
          <SectionHeading
            eyebrow="Mehndi Art"
            title="A Gallery of Designs"
            subtitle="Bridal, Arabic, Traditional, Minimal, Festive and Contemporary."
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

      {/* How to use */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-[1400px] px-5 lg:px-10">
          <Reveal>
            <SectionHeading eyebrow="The Ritual" title="How to Use" align="left" />
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
            Please review the ingredient list and follow the product instructions supplied with
            your order. Perform an appropriate patch test before use.
          </p>
        </div>
      </section>

      {/* Reviews */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
        <Reveal>
          <SectionHeading eyebrow="Reviews" title="From Our Customers" />
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {reviews.data?.length
            ? reviews.data.map((r) => (
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
            : (
              <p className="col-span-full text-center text-sm text-muted-foreground">
                No published reviews yet.
              </p>
            )}
        </div>
      </section>

      {/* Social */}
      <section className="bg-card py-20">
        <div className="mx-auto max-w-[1400px] px-5 text-center lg:px-10">
          <p className="eyebrow">@sartistic</p>
          <h2 className="mt-3 text-3xl md:text-4xl">Follow the artistry</h2>
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

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-24 lg:px-10">
        <Reveal>
          <SectionHeading eyebrow="Questions" title="Frequently Asked" />
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

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-primary py-28 text-primary-foreground">
        <div className="mx-auto max-w-3xl px-5 text-center lg:px-10">
          <p className="text-[0.68rem] tracking-[0.28em] uppercase opacity-70">SARTISTIC</p>
          <h2 className="mt-5 text-4xl leading-[1.05] md:text-6xl">Tradition, Crafted Beautifully.</h2>
          <p className="mx-auto mt-5 max-w-lg opacity-80">
            Where timeless Mehndi artistry meets modern elegance.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-9 h-13 rounded-none px-10">
            <Link to="/shop">Shop Mehndi</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
