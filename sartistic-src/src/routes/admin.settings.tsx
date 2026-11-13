import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { grantAdmin, listAdmins, revokeAdmin } from "@/lib/admin.functions";
import { invalidateStorefront } from "@/lib/admin-cache";
import { formatDate } from "@/lib/format";
import { PageHeader, Panel, StatusPill, useConfirm } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Admin access, your account and store-wide content."
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminTeam />
        <div className="space-y-6">
          <ChangePassword />
          <WhySartistic />
        </div>
      </div>
    </div>
  );
}

function AdminTeam() {
  const queryClient = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const admins = useQuery({ queryKey: ["admin", "team"], queryFn: () => listAdmins() });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await confirm({
      title: `Give admin access to ${email}?`,
      description: "They'll be able to manage products, orders, customers and other admins.",
      confirmLabel: "Grant access",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await grantAdmin({ data: { email } });
      toast.success(`${email} is now an admin`);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't grant access");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string, label: string) {
    const ok = await confirm({
      title: `Remove admin access for ${label}?`,
      description: "Their customer account stays; they just lose access to this dashboard.",
      confirmLabel: "Remove access",
      destructive: true,
    });
    if (!ok) return;
    try {
      await revokeAdmin({ data: { userId } });
      toast.success("Admin access removed");
      void queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove access");
    }
  }

  return (
    <Panel title="Admin team">
      {confirmDialog}
      <ul className="divide-y divide-border border-y border-border">
        {admins.data?.map((a) => (
          <li key={a.userId} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>
              <span className="block">
                {a.name || a.email} {a.isYou && <StatusPill>You</StatusPill>}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.email} · admin since {formatDate(a.since)}
              </span>
            </span>
            {!a.isYou && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove admin"
                onClick={() => void remove(a.userId, a.email ?? "this user")}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {admins.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {admins.isError && <p className="mt-3 text-sm text-destructive">Couldn't load admins.</p>}

      <form onSubmit={add} className="mt-6 space-y-2">
        <Label htmlFor="new-admin">Add an admin</Label>
        <div className="flex gap-2">
          <Input
            id="new-admin"
            type="email"
            placeholder="their@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy} className="rounded-none">
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The person must first create a normal account on the store with this email. There is no
          public admin sign-up.
        </p>
      </form>
    </Panel>
  );
}

function ChangePassword() {
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const password = String(f.get("password") ?? "");
    if (password.length < 8) return void toast.error("Use at least 8 characters");
    if (password !== String(f.get("confirm") ?? ""))
      return void toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return void toast.error(error.message || "Couldn't change password");
    form.reset();
    toast.success("Password changed");
  }

  return (
    <Panel title="Your password">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" name="password" type="password" autoComplete="new-password" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw2">Confirm new password</Label>
          <Input id="pw2" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <Button type="submit" disabled={busy} className="rounded-none">
          {busy ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Panel>
  );
}

type WhyItem = { number: string; title: string; description: string };

function WhySartistic() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<WhyItem[]>([]);
  const [busy, setBusy] = useState(false);
  const setting = useQuery({
    queryKey: ["admin", "settings", "why"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "why_sartistic")
        .maybeSingle();
      if (error) throw error;
      return (Array.isArray(data?.value) ? data.value : []) as WhyItem[];
    },
  });
  useEffect(() => {
    if (setting.data) setItems(setting.data);
  }, [setting.data]);

  async function save() {
    const cleaned = items
      .filter((i) => i.title.trim())
      .map((i, n) => ({
        number: String(n + 1).padStart(2, "0"),
        title: i.title.trim(),
        description: i.description.trim(),
      }));
    setBusy(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "why_sartistic", value: cleaned as unknown as Json }, { onConflict: "key" });
    setBusy(false);
    if (error) return void toast.error("Couldn't save");
    toast.success("Saved — live on the homepage");
    void queryClient.invalidateQueries({ queryKey: ["admin", "settings", "why"] });
    invalidateStorefront(queryClient);
  }

  return (
    <Panel
      title="“Why SARTISTIC” points (homepage)"
      actions={
        <Button
          variant="outline"
          size="sm"
          className="rounded-none"
          onClick={() => setItems((p) => [...p, { number: "", title: "", description: "" }])}
        >
          <Plus className="mr-1 size-3.5" /> Add
        </Button>
      }
    >
      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="space-y-2 border-b border-border pb-4 last:border-0">
            <div className="flex gap-2">
              <Input
                placeholder="Title"
                value={item.title}
                onChange={(e) =>
                  setItems((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove point"
                onClick={() => setItems((p) => p.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Textarea
              rows={2}
              placeholder="Description"
              value={item.description}
              onChange={(e) =>
                setItems((p) =>
                  p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                )
              }
            />
          </div>
        ))}
        <Button disabled={busy} className="rounded-none" onClick={() => void save()}>
          {busy ? "Saving…" : "Save points"}
        </Button>
      </div>
    </Panel>
  );
}
