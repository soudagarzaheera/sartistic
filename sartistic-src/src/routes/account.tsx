import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/account")({
  ssr: false,
  component: AccountLayout,
});

const links = [
  { to: "/account", label: "Profile" },
  { to: "/account/orders", label: "Orders" },
  { to: "/account/addresses", label: "Addresses" },
  { to: "/account/wishlist", label: "Wishlist" },
  { to: "/account/reviews", label: "Reviews" },
] as const;

function AccountLayout() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  if (loading || !user) {
    return <div className="min-h-[60vh] px-5 py-24 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <p className="eyebrow">My Account</p>
      <h1 className="mt-3 text-4xl md:text-5xl">{user.email}</h1>

      <div className="mt-12 grid gap-12 lg:grid-cols-[200px_1fr]">
        <nav className="flex flex-col items-start gap-2 text-sm">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/account" }}
              activeProps={{ className: "text-accent underline underline-offset-4" }}
              className="text-muted-foreground transition-colors hover:text-accent"
            >
              {l.label}
            </Link>
          ))}
          {isAdmin && (
            <Link to="/admin" className="text-muted-foreground hover:text-accent">
              Admin Dashboard
            </Link>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 text-muted-foreground hover:text-destructive"
          >
            Logout
          </button>
        </nav>
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
