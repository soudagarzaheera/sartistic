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

export const Route = createFileRoute("/account/addresses")({
  component: Addresses,
});

const schema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(20),
  address_line_1: z.string().trim().min(1).max(200),
  address_line_2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postal_code: z.string().trim().min(4).max(12),
});

function Addresses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const addresses = useQuery({
    queryKey: ["addresses", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function save(event: React.FormEvent<HTMLFormElement>, id: string | null) {
    event.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please complete the address");
      return;
    }
    const payload = {
      ...parsed.data,
      address_line_2: parsed.data.address_line_2 || null,
      country: "India",
      user_id: user!.id,
    };
    const { error } = id
      ? await supabase.from("addresses").update(payload).eq("id", id)
      : await supabase.from("addresses").insert(payload);
    if (error) {
      toast.error("We couldn't save that address.");
      return;
    }
    toast.success(id ? "Address updated" : "Address added");
    setEditing(null);
    setAdding(false);
    void queryClient.invalidateQueries({ queryKey: ["addresses", user!.id] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) {
      toast.error("We couldn't remove that address.");
      return;
    }
    toast("Address removed");
    void queryClient.invalidateQueries({ queryKey: ["addresses", user!.id] });
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-3xl">Addresses</h2>
        <Button onClick={() => setAdding((v) => !v)} className="rounded-none">
          {adding ? "Cancel" : "Add address"}
        </Button>
      </div>

      {adding && <AddressForm onSubmit={(e) => void save(e, null)} />}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {addresses.data?.map((a) =>
          editing === a.id ? (
            <div key={a.id} className="border border-border p-6">
              <AddressForm address={a} onSubmit={(e) => void save(e, a.id)} />
              <Button variant="ghost" className="mt-2 rounded-none" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <article key={a.id} className="border border-border p-6 text-sm">
              <p className="font-display text-xl">{a.full_name}</p>
              <p className="mt-2 text-muted-foreground">
                {a.address_line_1}
                {a.address_line_2 ? `, ${a.address_line_2}` : ""}
                <br />
                {a.city}, {a.state} {a.postal_code}
                <br />
                {a.phone}
              </p>
              <div className="mt-4 flex gap-4 text-xs tracking-[0.16em] uppercase">
                <button type="button" onClick={() => setEditing(a.id)} className="hover:text-accent">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(a.id)}
                  className="hover:text-destructive"
                >
                  Delete
                </button>
              </div>
            </article>
          ),
        )}
      </div>

      {!addresses.isLoading && (addresses.data?.length ?? 0) === 0 && !adding && (
        <p className="mt-6 text-sm text-muted-foreground">No saved addresses yet.</p>
      )}
    </section>
  );
}

type AddressRow = {
  full_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
};

function AddressForm({
  address,
  onSubmit,
}: {
  address?: AddressRow;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-4 border border-border p-6 sm:grid-cols-2">
      <Field label="Full name" name="full_name" value={address?.full_name} />
      <Field label="Phone" name="phone" value={address?.phone} />
      <Field label="Address" name="address_line_1" value={address?.address_line_1} />
      <Field label="Apartment / Area" name="address_line_2" value={address?.address_line_2 ?? ""} />
      <Field label="City" name="city" value={address?.city} />
      <Field label="State" name="state" value={address?.state} />
      <Field label="PIN code" name="postal_code" value={address?.postal_code} />
      <div className="sm:col-span-2">
        <Button type="submit" className="h-11 rounded-none px-8">
          Save address
        </Button>
      </div>
    </form>
  );
}

function Field({ label, name, value }: { label: string; name: string; value?: string | undefined }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value ?? ""} className="rounded-none" />
    </div>
  );
}
