import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { verifyAdminSession } from "@/lib/admin.functions";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/admin_/login")({
  ssr: false,
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Admin Sign In | SARTISTIC" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLogin,
});

/** Only allow redirects back into the admin area (no open redirects). */
function safeRedirect(value: string | undefined) {
  return value && value.startsWith("/admin") && !value.startsWith("/admin/login")
    ? value
    : "/admin";
}

function AdminLogin() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [busy, setBusy] = useState(false);

  // Already signed in as an admin → straight to the dashboard.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    verifyAdminSession()
      .then((r) => {
        if (!cancelled && r.isAdmin) void navigate({ to: safeRedirect(redirect), replace: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate, redirect]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = z.string().trim().email().safeParse(form.get("email"));
    if (!email.success) {
      toast.error("Enter a valid email address");
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error("We couldn't send the reset email. Please try again.");
        toast.success("If that account exists, a reset link is on its way.");
        setMode("signin");
        return;
      }

      const password = String(form.get("password") ?? "");
      const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
      if (error) throw new Error("Incorrect email or password.");

      const access = await verifyAdminSession();
      if (!access.isAdmin) {
        await supabase.auth.signOut();
        throw new Error("This account doesn't have admin access.");
      }
      toast.success("Welcome back");
      void navigate({ to: safeRedirect(redirect), replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-5 py-16">
      <div className="w-full max-w-sm border border-border bg-background p-8 sm:p-10">
        <p className="font-display text-2xl tracking-[0.2em] uppercase">Sartistic</p>
        <p className="eyebrow mt-1">Studio Admin</p>
        <h1 className="mt-8 text-3xl">{mode === "forgot" ? "Reset password" : "Sign in"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "We'll email you a link to choose a new password."
            : "Authorised staff only."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="rounded-none"
            />
          </div>
          {mode === "signin" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="rounded-none"
              />
            </div>
          )}
          <Button type="submit" disabled={busy} className="h-12 w-full rounded-none">
            {busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "forgot" : "signin")}
          >
            {mode === "signin" ? "Forgot password?" : "Back to sign in"}
          </button>
          <Link to="/" className="hover:text-foreground">
            Back to store
          </Link>
        </div>
      </div>
    </div>
  );
}
