import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/account/")({
  component: Profile,
});

function Profile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = z
      .object({
        full_name: z.string().trim().max(100),
        phone: z.string().trim().max(20),
      })
      .safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      toast.error("Please check your details");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.full_name || null, phone: parsed.data.phone || null })
      .eq("user_id", user!.id);
    setBusy(false);
    if (error) {
      toast.error("We couldn't save your profile. Please try again.");
      return;
    }
    toast.success("Profile updated");
    void queryClient.invalidateQueries({ queryKey: ["profile", user!.id] });
  }

  return (
    <section>
      <h2 className="font-display text-3xl">Profile</h2>
      {profile.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={save} className="mt-6 max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={profile.data?.full_name ?? ""}
              className="rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={profile.data?.phone ?? ""}
              className="rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} readOnly disabled className="rounded-none" />
          </div>
          <Button type="submit" disabled={busy} className="h-11 rounded-none px-8">
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      )}
    </section>
  );
}
