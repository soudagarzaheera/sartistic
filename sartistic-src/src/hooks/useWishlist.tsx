import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useWishlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: ids = [], isLoading } = useQuery({
    queryKey: ["wishlist", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wishlists")
        .select("product_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.product_id);
    },
  });

  async function toggle(productId: string) {
    if (!user) {
      toast("Please sign in to save favourites");
      return;
    }
    if (ids.includes(productId)) {
      await supabase.from("wishlists").delete().eq("user_id", user.id).eq("product_id", productId);
      toast("Removed from wishlist");
    } else {
      await supabase.from("wishlists").insert({ user_id: user.id, product_id: productId });
      toast("Saved to wishlist");
    }
    await queryClient.invalidateQueries({ queryKey: ["wishlist", user.id] });
  }

  return { ids, isLoading, toggle, has: (id: string) => ids.includes(id) };
}
