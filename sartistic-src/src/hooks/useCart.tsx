import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CartLine = {
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  variantName: string | null;
  slug: string;
  price: number;
  imageUrl: string;
  sku: string | null;
  stock: number;
};

type CartContextValue = {
  items: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  addItem: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  setQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  clear: () => void;
};

const STORAGE_KEY = "sartistic.cart.v1";

const CartContext = createContext<CartContextValue | null>(null);

function sameLine(a: CartLine, productId: string, variantId: string | null) {
  return a.productId === productId && (a.variantId ?? null) === (variantId ?? null);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartLine[]);
    } catch {
      /* ignore malformed local cart */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }, [items, hydrated]);

  // Persist the cart for signed-in customers and merge the guest cart on login.
  useEffect(() => {
    if (!hydrated || !user) return;
    let cancelled = false;

    (async () => {
      const { data: cart } = await supabase
        .from("carts")
        .upsert({ user_id: user.id }, { onConflict: "user_id" })
        .select("id")
        .maybeSingle();
      if (!cart || cancelled) return;

      const { data: remote } = await supabase
        .from("cart_items")
        .select(
          "product_id, variant_id, quantity, products(name, slug, price, sku, stock_quantity, product_images(image_url, is_primary, sort_order)), product_variants(name, price, stock_quantity)",
        )
        .eq("cart_id", cart.id);

      const remoteLines: CartLine[] = (remote ?? []).flatMap((row) => {
        const product = row.products as unknown as {
          name: string;
          slug: string;
          price: number;
          sku: string | null;
          stock_quantity: number;
          product_images: { image_url: string; is_primary: boolean; sort_order: number }[];
        } | null;
        if (!product) return [];
        const variant = row.product_variants as unknown as {
          name: string;
          price: number;
          stock_quantity: number;
        } | null;
        const image =
          [...(product.product_images ?? [])].sort(
            (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
          )[0]?.image_url ?? "/images/products/placeholder.jpg";
        return [
          {
            productId: row.product_id,
            variantId: row.variant_id,
            quantity: row.quantity,
            name: product.name,
            variantName: variant?.name ?? null,
            slug: product.slug,
            price: Number(variant?.price ?? product.price),
            imageUrl: image,
            sku: product.sku,
            stock: variant?.stock_quantity ?? product.stock_quantity,
          },
        ];
      });

      setItems((local) => {
        const merged = [...remoteLines];
        for (const line of local) {
          const existing = merged.find((m) => sameLine(m, line.productId, line.variantId));
          if (existing) existing.quantity = Math.max(existing.quantity, line.quantity);
          else merged.push(line);
        }
        void (async () => {
          await supabase.from("cart_items").delete().eq("cart_id", cart.id);
          if (merged.length) {
            await supabase.from("cart_items").insert(
              merged.map((m) => ({
                cart_id: cart.id,
                product_id: m.productId,
                variant_id: m.variantId,
                quantity: m.quantity,
              })),
            );
          }
        })();
        return merged;
      });
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per signed-in user session.
  }, [user?.id, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncRemote = useCallback(
    async (next: CartLine[]) => {
      if (!user) return;
      const { data: cart } = await supabase
        .from("carts")
        .upsert({ user_id: user.id }, { onConflict: "user_id" })
        .select("id")
        .maybeSingle();
      if (!cart) return;
      await supabase.from("cart_items").delete().eq("cart_id", cart.id);
      if (next.length) {
        await supabase.from("cart_items").insert(
          next.map((m) => ({
            cart_id: cart.id,
            product_id: m.productId,
            variant_id: m.variantId,
            quantity: m.quantity,
          })),
        );
      }
    },
    [user],
  );

  const update = useCallback(
    (updater: (prev: CartLine[]) => CartLine[]) => {
      setItems((prev) => {
        const next = updater(prev);
        void syncRemote(next);
        return next;
      });
    },
    [syncRemote],
  );

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return {
      items,
      count: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal,
      open,
      setOpen,
      addItem: (line, quantity = 1) =>
        update((prev) => {
          const existing = prev.find((p) => sameLine(p, line.productId, line.variantId));
          if (existing) {
            return prev.map((p) =>
              sameLine(p, line.productId, line.variantId)
                ? { ...p, quantity: p.quantity + quantity }
                : p,
            );
          }
          return [...prev, { ...line, quantity }];
        }),
      removeItem: (productId, variantId) =>
        update((prev) => prev.filter((p) => !sameLine(p, productId, variantId))),
      setQuantity: (productId, variantId, quantity) =>
        update((prev) =>
          quantity <= 0
            ? prev.filter((p) => !sameLine(p, productId, variantId))
            : prev.map((p) => (sameLine(p, productId, variantId) ? { ...p, quantity } : p)),
        ),
      clear: () => update(() => []),
    };
  }, [items, open, update]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
