import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side admin gate. The bearer token is verified by requireSupabaseAuth,
 * then the role is read from public.user_roles via has_role() — never from
 * anything the browser sends. Every admin server function uses this.
 */
const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || data !== true) throw new Error("Forbidden: admin access required");
    return next();
  });

/** Loaded lazily so the service-role client never reaches the browser bundle. */
async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Returns whether the signed-in user is an admin, checked on the server. */
export const verifyAdminSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) {
      console.error(`[admin] has_role check failed: ${error.message}`);
      throw new Error("Couldn't verify admin access. Please try again.");
    }
    return { isAdmin: data === true, userId: context.userId };
  });

export const listAdmins = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .order("created_at");
    if (error) throw new Error("Couldn't load admin accounts.");
    const ids = (roles ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await context.supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", ids)
      : { data: [] };
    return (roles ?? []).map((r) => {
      const p = profiles?.find((x) => x.user_id === r.user_id);
      return {
        userId: r.user_id,
        email: p?.email ?? null,
        name: p?.full_name ?? null,
        since: r.created_at,
        isYou: r.user_id === context.userId,
      };
    });
  });

/**
 * Grants admin to an EXISTING account (the person must have signed up first).
 * There is deliberately no public admin registration.
 */
export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getSupabaseAdmin();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("user_id")
      .ilike("email", data.email)
      .maybeSingle();
    if (error) throw new Error("Couldn't look up that account.");
    if (!profile) {
      throw new Error("No account uses that email. Ask them to sign up on the store first.");
    }
    const { error: insertError } = await admin
      .from("user_roles")
      .upsert({ user_id: profile.user_id, role: "admin" }, { onConflict: "user_id,role" });
    if (insertError) throw new Error("Couldn't grant admin access.");
    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("You can't remove your own admin access.");
    }
    const admin = await getSupabaseAdmin();
    const { count } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) throw new Error("At least one admin must remain.");
    const { error } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error("Couldn't remove admin access.");
    return { ok: true };
  });
