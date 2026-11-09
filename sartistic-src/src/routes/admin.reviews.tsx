import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/admin/reviews")({
  component: AdminReviews,
});

function AdminReviews() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");

  const reviews = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*, products(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    void queryClient.invalidateQueries({ queryKey: ["reviews"] });
  };

  async function setApproved(id: string, value: boolean) {
    const { error } = await supabase.from("reviews").update({ is_approved: value }).eq("id", id);
    if (error) toast.error("Couldn't update review");
    else {
      toast.success(value ? "Review approved" : "Review hidden");
      refresh();
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this review?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) toast.error("Couldn't delete review");
    else refresh();
  }

  const list = (reviews.data ?? []).filter((r) =>
    filter === "all" ? true : filter === "approved" ? r.is_approved : !r.is_approved,
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-4xl">Reviews</h1>
        <div className="flex gap-2">
          {(["pending", "approved", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="rounded-none capitalize" onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {reviews.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!reviews.isLoading && list.length === 0 && <p className="text-muted-foreground">No reviews here.</p>}
        {list.map((r) => (
          <article key={r.id} className="border border-border bg-background p-5 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">{(r.products as unknown as { name: string } | null)?.name} · {r.rating}★</p>
              <p className="text-muted-foreground">{r.author_name ?? "Customer"} · {formatDate(r.created_at)}{r.is_verified_purchase ? " · Verified" : ""}</p>
            </div>
            {r.title && <p className="mt-2">{r.title}</p>}
            <p className="mt-1 text-muted-foreground">{r.review}</p>
            {r.image_url && <img src={r.image_url} alt="" className="mt-3 size-24 object-cover" />}
            <div className="mt-4 flex gap-2">
              {r.is_approved ? (
                <Button size="sm" variant="outline" className="rounded-none" onClick={() => void setApproved(r.id, false)}>Reject / hide</Button>
              ) : (
                <Button size="sm" className="rounded-none" onClick={() => void setApproved(r.id, true)}>Approve</Button>
              )}
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(r.id)}>Delete</Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
