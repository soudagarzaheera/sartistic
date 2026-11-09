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

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    if (!q) return;
    setSearchOpen(false);
    setMenuOpen(false);
    void navigate({ to: "/search", search: { q } });
  }

  return (
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

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background lg:hidden">
          <div className="flex h-20 items-center justify-between px-5">
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
          <nav className="flex flex-col px-5 pt-6">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="border-b border-border py-5 font-display text-3xl"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to={user ? "/account" : "/auth"}
              onClick={() => setMenuOpen(false)}
              className="border-b border-border py-5 font-display text-3xl"
            >
              {user ? "My Account" : "Sign In"}
            </Link>
            <Link
              to="/account/wishlist"
              onClick={() => setMenuOpen(false)}
              className="border-b border-border py-5 font-display text-3xl"
            >
              Wishlist
            </Link>
          </nav>
          <div className="px-5 pt-8">
            <Button asChild className="h-12 w-full rounded-none">
              <Link to="/shop" onClick={() => setMenuOpen(false)}>
                Shop Mehndi
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
