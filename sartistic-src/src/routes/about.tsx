import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Our Story | SARTISTIC Mehndi" },
      {
        name: "description",
        content:
          "SARTISTIC celebrates Mehndi as an art form — traditional inspiration presented as a modern, premium brand experience.",
      },
      { property: "og:title", content: "Our Story | SARTISTIC Mehndi" },
      {
        property: "og:description",
        content: "More than Mehndi. It's an art form.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div>
      <section className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="eyebrow">About SARTISTIC</p>
          <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.02]">
            More Than Mehndi. It's an Art Form.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            6 years of experience crafting Mehndi for weddings, festivals and everyday celebration.
          </p>
        </div>
      </section>

      <section className="relative">
        <img
          src="/images/image1.jpg"
          alt="Mehndi adorned hands on ivory silk"
          loading="lazy"
          className="h-[52vh] w-full object-cover"
        />
      </section>

      <section className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10">
        <div className="grid gap-14 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl leading-tight md:text-4xl">
              A tradition kept alive by patient hands.
            </h2>
          </Reveal>
          <Reveal delay={100} className="space-y-5 text-muted-foreground leading-relaxed">
            <p>
              Mehndi is a language of celebration. It marks weddings and festivals, quiet
              afternoons and shared laughter — drawn line by line, then left to develop in its own
              time.
            </p>
            <p>
              With 6 years of experience in Mehndi artistry, SARTISTIC takes that tradition
              seriously. We focus on the parts we can control well:
              finely prepared cones, considered presentation and clear, honest information about
              what is inside each product.
            </p>
            <p>
              Everything we publish about our products — ingredients, instructions, shipping and
              returns — comes from our own product records, so what you read is what you receive.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="bg-card py-20">
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-5 lg:grid-cols-[1fr_1.1fr] lg:px-10">
          <Reveal className="order-2 lg:order-1">
            <h2 className="text-3xl leading-tight md:text-4xl">
              Modern elegance, Indian at heart.
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Our design language borrows from block prints, temple geometry and the warm palette
              of henna itself — deep browns, warm ivories and muted terracotta — rendered with the
              restraint of a modern editorial brand.
            </p>
            <Button asChild className="mt-8 h-12 rounded-none px-8">
              <Link to="/shop">Shop Mehndi</Link>
            </Button>
          </Reveal>
          <Reveal delay={100} className="order-1 lg:order-2">
            <img
              src="/images/image2.jpg"
              alt="Henna leaves and a carved wooden block"
              loading="lazy"
              className="w-full object-cover"
            />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
