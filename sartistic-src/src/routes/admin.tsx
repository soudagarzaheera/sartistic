import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BarChart3, Images, MessageSquare, Package, ShoppingBag, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin | SARTISTIC" },
      { name: "description", content: "SARTISTIC store administration." },
      { property: "og:title", content: "Admin | SARTISTIC" },
      { property: "og:description", content: "Store administration." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Dashboard", icon: BarChart3 },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/reviews", label: "Reviews", icon: MessageSquare },
  { to: "/admin/gallery", label: "Gallery", icon: Images },
] as const;

function AdminLayout() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="p-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-16 text-center">
        <h1 className="text-3xl">Admins only</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This account doesn't have admin access.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm underline">
          Back to store
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-secondary/40">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-background p-6 md:block">
        <Link to="/" className="font-display text-xl tracking-[0.2em] uppercase">
          Sartistic
        </Link>
        <p className="eyebrow mt-1">Admin</p>
        <nav className="mt-10 flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/admin" }}
              activeProps={{ className: "bg-secondary text-foreground" }}
              className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 overflow-x-auto">
        <nav className="flex gap-4 overflow-x-auto border-b border-border bg-background p-4 text-sm md:hidden">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="whitespace-nowrap text-muted-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
