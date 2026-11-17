import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Shared layout for the Return and Refund policy pages. */
export function PolicyPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
  related,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  updated: string;
  sections: { id: string; title: string; body: ReactNode }[];
  related: { to: "/return-policy" | "/refund-policy"; label: string };
}) {
  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 md:py-20 lg:px-10">
      <header className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-4 text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.05]">{title}</h1>
        <div className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
          {intro}
        </div>
        <p className="mt-4 text-xs tracking-[0.14em] text-muted-foreground uppercase">
          Last updated {updated}
        </p>
      </header>

      <div className="mt-14 grid gap-12 lg:grid-cols-[220px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-28 space-y-3 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-accent">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-12">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="text-2xl md:text-3xl">{s.title}</h2>
              <div className="policy-body mt-4 space-y-4 text-[0.95rem] leading-relaxed text-muted-foreground [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}

          <div className="border-t border-border pt-8 text-sm text-muted-foreground">
            See also our{" "}
            <Link to={related.to} className="underline underline-offset-4 hover:text-accent">
              {related.label}
            </Link>
            . Questions?{" "}
            <Link to="/contact" className="underline underline-offset-4 hover:text-accent">
              Contact us
            </Link>{" "}
            with your order number and we'll be glad to help.
          </div>
        </div>
      </div>
    </div>
  );
}
