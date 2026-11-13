import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BarChart3,
  FolderTree,
  Home,
  ImageIcon,
  Images,
  Layers,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { verifyAdminSession } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin | SARTISTIC" },
      { name: "description", content: "SARTISTIC store administration." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Dashboard", icon: BarChart3 },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/collections", label: "Collections", icon: Layers },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/homepage", label: "Homepage", icon: Home },
  { to: "/admin/images", label: "Image Library", icon: ImageIcon },
  { to: "/admin/gallery", label: "Design Gallery", icon: Images },
  { to: "/admin/reviews", label: "Reviews", icon: MessageSquare },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function AdminLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  // Role is verified on the server on every visit — never taken from client state.
  const access = useQuery({
    queryKey: ["admin", "session", user?.id],
    enabled: Boolean(user),
    queryFn: () => verifyAdminSession(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!loading && !user) {
      void navigate({ to: "/admin/login", search: { redirect: pathname }, replace: true });
    }
  }, [loading, user, navigate, pathname]);

  useEffect(() => {
    if (access.data && !access.data.isAdmin) {
      toast.error("This account doesn't have admin access.");
      void navigate({ to: "/", replace: true });
    }
  }, [access.data, navigate]);

  useEffect(() => setMenuOpen(false), [pathname]);

  async function logout() {
    await signOut();
    toast("Signed out");
    void navigate({ to: "/admin/login", replace: true });
  }

  if (loading || !user || access.isLoading || (access.data && !access.data.isAdmin)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }
  if (access.isError) {
    return (
      <div className="mx-auto max-w-md p-16 text-center">
        <h1 className="text-3xl">Couldn't verify access</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {access.error instanceof Error ? access.error.message : "Please try again."}
        </p>
        <Button className="mt-6 rounded-none" onClick={() => void access.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-7 pb-8">
        <Link to="/" className="font-display text-xl tracking-[0.2em] uppercase">
          Sartistic
        </Link>
        <p className="eyebrow mt-1">Studio Admin</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === "/admin" }}
            activeProps={{ className: "bg-secondary text-foreground" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:text-foreground"
          >
            <n.icon className="size-4" strokeWidth={1.5} /> {n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{user.email}</p>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" strokeWidth={1.5} /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-secondary/40">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-background lg:block">
        {sidebar}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center"
          >
            <Menu className="size-5" />
          </button>
          <span className="font-display text-lg tracking-[0.2em] uppercase">Sartistic</span>
          <span className="size-10" />
        </header>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>

        <main className={cn("mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-10")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
