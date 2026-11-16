import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/shop" },
  { label: "Collections", to: "/collections" },
  { label: "About", to: "/about" },
  { label: "Mehndi Art", to: "/mehndi-art" },
  { label: "Contact", to: "/contact" },
] as const;

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const { count, setOpen } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (s) => s.pathname });
  const overHero = pathname === "/" && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the mobile menu is open: lock background scroll, close on Escape,
  // and close if the viewport grows to desktop width (where it's hidden).
  useEffect(() => {
    if (!menuOpen) return;
    const { body, documentElement } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onDesktop = () => desktop.matches && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onDesktop);
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [menuOpen]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    if (!q) return;
    setSearchOpen(false);
    setMenuOpen(false);
    void navigate({ to: "/search", search: { q } });
  }

  return (
    <>
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-background/92 border-b border-border backdrop-blur-md"
          : "bg-transparent border-b border-transparent",
      )}
    >
        <div
          className={cn(
            "mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 transition-all duration-500 lg:px-10",
            scrolled ? "h-16" : "h-20 lg:h-24",
            overHero && "text-primary-foreground",
          )}
        >
        <Link
          to="/"
          className={cn(
            "font-display text-xl tracking-[0.34em] uppercase transition-colors duration-500 lg:text-2xl",
            overHero && "text-primary-foreground",
          )}
        >
          Sartistic
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="relative text-[0.78rem] tracking-[0.16em] uppercase transition-colors hover:text-accent"
              activeProps={{ className: "text-accent" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Search products"
            onClick={() => setSearchOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-full transition-colors hover:bg-secondary"
          >
            <Search className="size-[18px]" />
          </button>
          <Link
            to={user ? "/account" : "/auth"}
            aria-label="Account"
            className="grid size-10 place-items-center rounded-full transition-colors hover:bg-secondary"
          >
            <User className="size-[18px]" />
          </Link>
          <Link
            to="/account/wishlist"
            aria-label="Wishlist"
            className="hidden size-10 place-items-center rounded-full transition-colors hover:bg-secondary sm:grid"
          >
            <Heart className="size-[18px]" />
          </Link>
          <button
            type="button"
            aria-label="Open cart"
            onClick={() => setOpen(true)}
            className="relative grid size-10 place-items-center rounded-full transition-colors hover:bg-secondary"
          >
            <ShoppingBag className="size-[18px]" />
            {count > 0 && (
              <span className="absolute top-1 right-0 grid size-4 place-items-center rounded-full bg-accent text-[10px] text-accent-foreground">
                {count}
              </span>
            )}
          </button>
          <Button asChild size="sm" className="ml-2 hidden rounded-none px-5 lg:inline-flex">
            <Link to="/shop">Shop Now</Link>
          </Button>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center rounded-full transition-colors hover:bg-secondary lg:hidden"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="border-t border-border bg-background/97 backdrop-blur-md">
          <form onSubmit={submitSearch} className="mx-auto max-w-[1400px] px-5 py-4 lg:px-10">
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search cones, bundles, kits…"
              className="w-full border-b border-border bg-transparent py-3 text-lg outline-none placeholder:text-muted-foreground focus:border-accent"
            />
          </form>
        </div>
      )}

    </header>

      {/*
        Rendered as a sibling of <header>, not inside it: the scrolled header
        uses backdrop-filter, which turns it into the containing block for
        fixed-position children and squeezed this overlay into the 64px bar.
      */}
      {menuOpen && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-[60] flex h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-border px-5">
            <span className="font-display text-xl tracking-[0.34em] uppercase">Sartistic</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="grid size-10 place-items-center rounded-full hover:bg-secondary"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">
            <ul className="flex flex-col">
              {[
                ...NAV,
                { label: user ? "My Account" : "Sign In", to: user ? "/account" : "/auth" },
                { label: "Wishlist", to: "/account/wishlist" },
              ].map((item) => (
                <li key={item.label} className="border-b border-border">
                  <Link
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-14 items-center py-3 font-display text-[1.625rem] leading-tight break-words transition-colors hover:text-accent sm:text-3xl"
                    activeProps={{ className: "text-accent" }}
                    activeOptions={{ exact: item.to === "/" || item.to === "/account" }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="shrink-0 border-t border-border px-5 py-4">
            <Button asChild className="h-12 w-full rounded-none">
              <Link to="/shop" onClick={() => setMenuOpen(false)}>
                Shop Mehndi
              </Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
