import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/account/reviews")({
  component: MyReviews,
});

const schema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120),
  review: z.string().trim().min(10, "Please write at least a sentence").max(1500),
});

function MyReviews() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<{ productId: string; orderId: string } | null>(null);

  const purchased = useQuery({
    queryKey: ["purchased", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_items(product_id, product_name)")
        .eq("user_id", user!.id)
        .eq("payment_status", "paid");
      if (error) throw error;
      const map = new Map<string, { productId: string; orderId: string; name: string }>();
      for (const o of data ?? [])
        for (const i of o.order_items ?? [])
          if (i.product_id && !map.has(i.product_id))
            map.set(i.product_id, { productId: i.product_id, orderId: o.id, name: i.product_name });
      return [...map.values()];
    },
  });

  const mine = useQuery({
    queryKey: ["my-reviews", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, product_id, rating, title, review, is_approved, created_at, products(name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your review");
      return;
    }
    const { error } = await supabase.from("reviews").insert({
      user_id: user!.id,
      product_id: target.productId,
      order_id: target.orderId,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      review: parsed.data.review,
      author_name: user!.user_metadata?.["full_name"] ?? null,
    });
    if (error) {
      toast.error("We couldn't submit your review.");
      return;
    }
    toast.success("Thank you! Your review will appear once approved.");
    setTarget(null);
    void queryClient.invalidateQueries({ queryKey: ["my-reviews", user!.id] });
  }

  const reviewed = new Set((mine.data ?? []).map((r) => r.product_id));
  const pending = (purchased.data ?? []).filter((p) => !reviewed.has(p.productId));

  return (
    <section>
      <h2 className="font-display text-3xl">Reviews</h2>

      {pending.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow">Ready to review</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pending.map((p) => (
              <Button
                key={p.productId}
                variant={target?.productId === p.productId ? "default" : "outline"}
                className="rounded-none"
                onClick={() => setTarget({ productId: p.productId, orderId: p.orderId })}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {target && (
        <form onSubmit={submit} className="mt-6 max-w-lg space-y-4 border border-border p-6">
          <select name="rating" defaultValue="5" className="border border-border bg-background px-3 py-2">
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r} stars
              </option>
            ))}
          </select>
          <Input name="title" placeholder="Title (optional)" className="rounded-none" />
          <Textarea name="review" rows={5} placeholder="Your review" className="rounded-none" />
          <Button type="submit" className="rounded-none">
            Submit review
          </Button>
        </form>
      )}

      {purchased.data && purchased.data.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          You can review products after a paid order.
        </p>
      )}

      <div className="mt-8 space-y-4">
        {mine.data?.map((r) => (
          <article key={r.id} className="border border-border p-5 text-sm">
            <p className="font-display text-lg">
              {(r.products as unknown as { name: string } | null)?.name} · {r.rating}★
            </p>
            {r.title && <p className="mt-1">{r.title}</p>}
            <p className="mt-1 text-muted-foreground">{r.review}</p>
            <p className="mt-2 text-xs tracking-[0.14em] text-muted-foreground uppercase">
              {formatDate(r.created_at)} · {r.is_approved ? "Published" : "Awaiting approval"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
