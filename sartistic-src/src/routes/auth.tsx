import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In | SARTISTIC" },
      {
        name: "description",
        content: "Sign in or create your SARTISTIC account to track orders and save favourites.",
      },
      { property: "og:title", content: "Sign In | SARTISTIC" },
      { property: "og:description", content: "Access your SARTISTIC account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/account" });
  }, [user, loading, navigate]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = emailSchema.safeParse(form.get("email"));
    if (!email.success) {
      toast.error(email.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
          redirectTo: `${window.location.origin}/account`,
        });
        if (error) throw error;
        toast.success("Password reset link sent. Please check your inbox.");
        setMode("signin");
        return;
      }

      const password = passwordSchema.safeParse(form.get("password"));
      if (!password.success) {
        toast.error(password.error.issues[0]?.message ?? "Please check your details");
        return;
      }

      if (mode === "signup") {
        const fullName = String(form.get("full_name") ?? "").trim().slice(0, 100);
        const { error } = await supabase.auth.signUp({
          email: email.data,
          password: password.data,
          options: {
            emailRedirectTo: `${window.location.origin}/account`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm your address.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.data,
        password: password.data,
      });
      if (error) throw error;
      toast.success("Welcome back");
      void navigate({ to: "/account" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(
        /invalid login/i.test(message)
          ? "That email and password don't match."
          : /already registered/i.test(message)
            ? "An account with this email already exists. Try signing in."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    // Supabase sends the browser to Google, then back to /account with the session.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (error) {
      toast.error("Google sign-in didn't complete. Please try again.");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img
          src="/images/image2.jpg"
          alt="Henna leaves and carved wooden block"
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-foreground/35" />
        <div className="absolute bottom-12 left-12 max-w-sm text-background">
          <p className="font-display text-4xl leading-tight">Tradition, Crafted Beautifully.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">
          <Link to="/" className="font-display text-2xl tracking-[0.2em] uppercase">
            Sartistic
          </Link>
          <h1 className="mt-8 text-4xl">
            {mode === "signin"
              ? "Welcome back"
              : mode === "signup"
                ? "Create your account"
                : "Reset your password"}
          </h1>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" name="full_name" className="rounded-none" required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" className="rounded-none" required />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  className="rounded-none"
                  required
                />
              </div>
            )}
            <Button type="submit" disabled={busy} className="h-12 w-full rounded-none">
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign In"
                  : mode === "signup"
                    ? "Create Account"
                    : "Send Reset Link"}
            </Button>
          </form>

          {mode !== "forgot" && (
            <>
              <div className="my-6 flex items-center gap-4 text-xs tracking-[0.18em] text-muted-foreground uppercase">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                variant="outline"
                onClick={() => void google()}
                className="h-12 w-full rounded-none"
              >
                Continue with Google
              </Button>
            </>
          )}

          <div className="mt-8 space-y-2 text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                <button type="button" onClick={() => setMode("signup")} className="hover:text-accent">
                  New here? Create an account
                </button>
                <br />
                <button type="button" onClick={() => setMode("forgot")} className="hover:text-accent">
                  Forgot your password?
                </button>
              </>
            )}
            {mode !== "signin" && (
              <button type="button" onClick={() => setMode("signin")} className="hover:text-accent">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
