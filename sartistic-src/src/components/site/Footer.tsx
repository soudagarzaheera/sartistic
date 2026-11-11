import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Instagram, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

export function Footer() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function subscribe(event: React.FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email: parsed.data.toLowerCase() });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) {
      toast.error("We couldn't sign you up just now. Please try again.");
      return;
    }
    setEmail("");
    toast.success("You're on the list. Welcome to SARTISTIC.");
  }

  return (
    <footer className="mt-24 bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-20 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:px-10">
        <div>
          <p className="font-display text-2xl tracking-[0.34em] uppercase">Sartistic</p>
          <p className="mt-5 max-w-xs text-sm leading-relaxed opacity-75">
            Tradition, Crafted Beautifully. Premium Mehndi, thoughtfully presented for moments of
            beauty and celebration.
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href="https://instagram.com/sartistic02"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="grid size-10 place-items-center border border-current/30 transition-colors hover:border-current"
            >
              <Instagram className="size-4" />
            </a>
            <Link
              to="/contact"
              aria-label="Contact us"
              className="grid size-10 place-items-center border border-current/30 transition-colors hover:border-current"
            >
              <Mail className="size-4" />
            </Link>
          </div>
        </div>

        <FooterColumn
          title="Shop"
          links={[
            { label: "All Products", to: "/shop" },
            { label: "Collections", to: "/collections" },
            { label: "Mehndi Art", to: "/mehndi-art" },
          ]}
        />
        <FooterColumn
          title="Brand"
          links={[
            { label: "Our Story", to: "/about" },
            { label: "Contact", to: "/contact" },
            { label: "My Account", to: "/account" },
          ]}
        />

        <div>
          <p className="text-[0.68rem] tracking-[0.28em] uppercase opacity-70">Newsletter</p>
          <p className="mt-4 text-sm opacity-75">
            New designs, new drops and quiet notes from the studio.
          </p>
          <form onSubmit={subscribe} className="mt-5 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="min-w-0 flex-1 border-b border-current/30 bg-transparent py-2 text-sm outline-none placeholder:text-current/50 focus:border-current"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={busy}
              className="rounded-none"
            >
              {busy ? "…" : "Join"}
            </Button>
          </form>
        </div>
      </div>

      <div className="border-t border-current/15">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-5 py-6 text-xs opacity-60 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <p>© {new Date().getFullYear()} SARTISTIC. All rights reserved.</p>
          <p>Please follow the instructions supplied with your product before use.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) {
  return (
    <div>
      <p className="text-[0.68rem] tracking-[0.28em] uppercase opacity-70">{title}</p>
      <ul className="mt-4 space-y-3 text-sm">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="opacity-80 transition-opacity hover:opacity-100">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
